"use strict";

/**
 * POST /api2/check
 * Check step: duplicate check → content gate stub → Claude scoring → sealed result.
 * Returns { status, submissionId?, checkPayload?, error? }
 *
 * Body: multipart/form-data — fields: name, flavorText; file field: image.
 * ownerId comes from the session cookie, never from the client.
 * req.file is populated by multer (memory storage).
 * Image pipeline: sharp strips EXIF/GPS + converts to JPEG + resizes,
 * then uploads to Cloudinary pending/ folder. Final URL stored in seal.
 */

const { getDb }   = require("./_db");
const Anthropic   = require("@anthropic-ai/sdk");
const sharp       = require("sharp");
const { uploadBuffer } = require("./_cloudinary");
const { LEGAL_SHAPES, FAMILIES, COLLECTION_MAX, STAT_BUDGET, STAT_MIN, STAT_MAX } = require("../engine2/constants");
const { requirePlayer } = require("../auth/player");
const { logEvent } = require("./_events");

// ── MongoDB-backed sealed-result store ────────────────────────────────────────
// Survives restarts and multi-process deploys. TTL index expires docs after
// 30 minutes — ensureSealIndex() creates it automatically on first use.

let _indexEnsured = false;
async function ensureSealIndex() {
  if (_indexEnsured) return;
  _indexEnsured = true;
  try {
    const db = await getDb();
    await db.collection("sealedResults").createIndex(
      { sealedAt: 1 },
      { expireAfterSeconds: 1800, background: true }
    );
  } catch (_) { /* non-fatal */ }
}

async function storeSeal(submissionId, result) {
  await ensureSealIndex();
  const db = await getDb();
  await db.collection("sealedResults").replaceOne(
    { submissionId },
    { ...result, sealedAt: new Date(result.sealedAt) },
    { upsert: true }
  );
}

async function getSeal(submissionId) {
  const db = await getDb();
  return db.collection("sealedResults").findOne({ submissionId }) || null;
}

async function deleteSeal(submissionId) {
  const db = await getDb();
  await db.collection("sealedResults").deleteOne({ submissionId });
}

// Atomically find-and-delete the seal in one operation.
// Returns the seal doc if found and owned by ownerId, null otherwise.
// Prevents two concurrent mint calls from both consuming the same seal.
async function consumeSeal(submissionId, ownerId) {
  const db = await getDb();
  const result = await db.collection("sealedResults").findOneAndDelete({ submissionId, ownerId });
  return result ?? null;
}

module.exports.getSeal     = getSeal;
module.exports.deleteSeal  = deleteSeal;
module.exports.consumeSeal = consumeSeal;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  return new Anthropic({ apiKey, timeout: 90_000 });
}

const NAME_MAX   = 28;
const FLAVOR_MAX = 160;
const MAX_TRIES  = 3;

const LEGAL_SHAPE_STRINGS = new Set(
  LEGAL_SHAPES.map(s => [...s].sort((a,b)=>b-a).join("/"))
);

function isLegalShape(p, s, w) {
  const key = [p, s, w].sort((a, b) => b - a).join("/");
  return LEGAL_SHAPE_STRINGS.has(key);
}

function makeFingerprint(name, text) {
  const norm = str =>
    str.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
  return `${norm(name)}|${norm(text)}`;
}

function validateLLMResponse(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "response is not an object" };
  const { power, speed, wits, family, kind, readAs, reasoning, anchors } = raw;
  for (const [k, v] of [["power", power], ["speed", speed], ["wits", wits]]) {
    if (!Number.isInteger(v)) return { ok: false, reason: `"${k}" must be an integer` };
    if (v < STAT_MIN || v > STAT_MAX) return { ok: false, reason: `"${k}" out of range (got ${v})` };
  }
  if (power + speed + wits !== STAT_BUDGET)
    return { ok: false, reason: `stats sum to ${power+speed+wits}, expected ${STAT_BUDGET}` };
  if (!isLegalShape(power, speed, wits))
    return { ok: false, reason: `[${[power,speed,wits].sort((a,b)=>b-a).join("/")}] is not a legal shape` };
  if (!FAMILIES.includes(family))
    return { ok: false, reason: `family must be Vita, Terra or Arte (got "${family}")` };
  if (!kind || typeof kind !== "string" || !kind.trim())
    return { ok: false, reason: "kind is required" };
  if (kind.trim().split(/\s+/).length > 2)
    return { ok: false, reason: "kind must be 1–2 words" };
  if (!readAs || typeof readAs !== "string" || !readAs.trim())
    return { ok: false, reason: "readAs is required" };
  if (/\b(power|speed|wits)\s*\d/i.test(readAs) || /\b\d+\s*\/\s*\d+/i.test(readAs))
    return { ok: false, reason: "readAs must not contain stats or numbers" };
  if (!reasoning || typeof reasoning !== "string" || !reasoning.trim())
    return { ok: false, reason: "reasoning is required" };
  if (!Array.isArray(anchors) || anchors.length === 0)
    return { ok: false, reason: "anchors must be a non-empty array" };
  return { ok: true };
}

// The full rubric as the system prompt — read from card-creation-rubric.md.
// Inline the key instruction so the server doesn't need a file path dependency.
const SYSTEM_PROMPT = require("fs").readFileSync(
  require("path").join(__dirname, "../rubric.md"),
  "utf8"
);

// ── Handler ───────────────────────────────────────────────────────────────────

module.exports.handler = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  console.log("check: request received");

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    let player;
    try {
      player = await requirePlayer(req);
    } catch (e) {
      console.log("check: auth failed", e?.body);
      if (e.status && e.body) return res.status(e.status).json(e.body);
      throw e;
    }

    const { name, flavorText, imageUrl } = req.body || {};
    const ownerId = player.id;
    console.log("check: player", ownerId, "name:", name?.slice(0, 20));

    // ── Basic input validation ────────────────────────────────────────────────
    if (!name?.trim())       { console.log("check: missing name"); return res.status(400).json({ status: "error", error: "name required" }); }
    if (!flavorText?.trim()) { console.log("check: missing flavorText"); return res.status(400).json({ status: "error", error: "flavorText required" }); }
    if (name.trim().length > NAME_MAX)
      return res.status(400).json({ status: "error", error: `name must be ${NAME_MAX} characters or fewer` });
    if (flavorText.trim().length > FLAVOR_MAX)
      return res.status(400).json({ status: "error", error: `flavorText must be ${FLAVOR_MAX} characters or fewer` });

    logEvent(ownerId, 'make_started');

    console.log("check: connecting to db");
    const db = await getDb();
    console.log("check: db connected");

    // ── Step 0: collection full? ──────────────────────────────────────────────
    const total = await db.collection("cardsv2").countDocuments({ ownerId, deleted: { $ne: true } });
    console.log("check: total cards:", total);
    if (total >= COLLECTION_MAX)
      return res.status(200).json({ status: "collection_full" });

    // ── Step 2: duplicate check ───────────────────────────────────────────────
    const fp = makeFingerprint(name.trim(), flavorText.trim());
    const existing = await db.collection("cardsv2").findOne({ ownerId, fingerprint: fp });
    if (existing) {
      console.log("check: duplicate found");
      return res.status(200).json({
        status: "already_made",
        matchedName: existing.name,
        isDeleted: existing.deleted === true,
      });
    }

    // ── Decline block check ───────────────────────────────────────────────────
    const now = new Date();
    if (player.checkBlockedUntil && player.checkBlockedUntil > now) {
      console.log("check: rate limited");
      return res.status(200).json({ status: "rate_limited" });
    }
    // Reset stale counter
    if (player.checkBlockedUntil && player.checkBlockedUntil <= now) {
      await db.collection("players").updateOne(
        { id: player.id },
        { $set: { checkBlockedUntil: null, declineCount: 0 } }
      );
      player.declineCount = 0;
    }

    // ── Step 3: content gate (stub — always allowed during testing) ───────────
    const gateResult = { verdict: "allowed" };
    if (gateResult.verdict === "declined") {
      // Increment decline counter
      const newCount = (player.declineCount || 0) + 1;
      const update = { $set: { declineCount: newCount } };
      if (newCount >= 5) {
        update.$set.checkBlockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
        update.$set.declineCount = 0;
      }
      await db.collection("players").updateOne({ id: player.id }, update);
      logEvent(ownerId, 'check_declined', { category: gateResult.category });
      return res.status(200).json({ status: "declined", category: gateResult.category, message: gateResult.message });
    }
    if (gateResult.verdict === "review")
      return res.status(200).json({ status: "in_review" });

    // ── LLM rate limit: max 3 scoring calls per minute per player ────────────
    // Targets automated abuse (a script can fire hundreds/min); a real user
    // photographing + naming a card can't exceed ~1/min in normal use.
    const nowMs      = Date.now();
    const windowMs   = 60 * 1000; // 1 minute
    const LLM_LIMIT  = 3;
    const recentAttempts = (player.llmAttempts || []).filter(t => nowMs - t < windowMs);
    if (recentAttempts.length >= LLM_LIMIT) {
      return res.status(429).json({ status: "rate_limited", error: "Too many requests — wait a moment and try again." });
    }
    // Record this attempt before the LLM call (prevents racing around the limit)
    await db.collection("players").updateOne(
      { id: ownerId },
      { $set: { llmAttempts: [...recentAttempts, nowMs] } }
    );

    console.log("check: passed duplicate/gate checks, calling LLM");

    // ── Image pipeline: strip EXIF, convert, resize, upload to Cloudinary ────
    let pendingImagePublicId = null;
    let pendingImageUrl      = null;
    if (req.file?.buffer) {
      try {
        const processed = await sharp(req.file.buffer)
          .rotate()                                            // auto-orient, strips EXIF orientation
          .jpeg({ quality: 88 })                             // convert to JPEG (handles HEIC via libvips)
          .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
          .toBuffer();
        const upload = await uploadBuffer(processed, {
          folder:        "allagaroo/pending",
          resource_type: "image",
          format:        "jpg",
        });
        pendingImagePublicId = upload.public_id;
        pendingImageUrl      = upload.secure_url;
        console.log("check: image uploaded to Cloudinary:", pendingImagePublicId);
      } catch (imgErr) {
        console.error("check: image upload failed (non-fatal):", imgErr.message);
      }
    }

    // ── Steps 4 + 5: LLM scoring with validation retry ───────────────────────
    const userContent = [];
    if (pendingImageUrl) {
      userContent.push({ type: "image", source: { type: "url", url: pendingImageUrl } });
    }
    userContent.push({
      type: "text",
      text: `Card name: ${name.trim()}\nAbout it: ${flavorText.trim()}`,
    });

    let llmResponse = null;
    let lastError = null;
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      let raw;
      try {
        const msg = await getClient().messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userContent }],
        });
        const text = msg.content[0].text.trim();
        console.log("check: raw LLM text:", text.slice(0, 300));
        // Strip markdown code fences if present, then extract JSON object
        const stripped = text.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/im, '').trim();
        try { raw = JSON.parse(stripped); }
        catch { const m = stripped.match(/\{[\s\S]*\}/); raw = m ? JSON.parse(m[0]) : null; }
      } catch (err) {
        console.log("check: LLM call error:", err.message);
        return res.status(500).json({ status: "error", error: `Scoring error: ${err.message}` });
      }
      const v = validateLLMResponse(raw);
      if (!v.ok) console.log("check: attempt", attempt, "failed:", v.reason, "| raw:", JSON.stringify(raw)?.slice(0, 200));
      else console.log("check: attempt", attempt, "ok");
      if (v.ok) { llmResponse = raw; break; }
      lastError = v.reason;
    }
    if (!llmResponse)
      return res.status(500).json({ status: "error", error: `Scoring failed after ${MAX_TRIES} attempts: ${lastError}` });

    // ── Step 6: build and store sealed result ─────────────────────────────────
    const submissionId = crypto.randomUUID();
    const carriesSeven = Math.max(llmResponse.power, llmResponse.speed, llmResponse.wits) === 7;

    const sealedResult = {
      submissionId,
      sealedAt: Date.now(),
      ownerId,
      submission: { name: name.trim(), flavorText: flavorText.trim(), imageUrl: pendingImageUrl },
      pendingImagePublicId,
      fingerprint: fp,
      carriesSeven,
      sealed: {
        power: llmResponse.power, speed: llmResponse.speed, wits: llmResponse.wits,
        family: llmResponse.family, kind: llmResponse.kind,
        readAs: llmResponse.readAs, reasoning: llmResponse.reasoning, anchors: llmResponse.anchors,
      },
    };
    await storeSeal(submissionId, sealedResult);

    logEvent(ownerId, 'check_passed');

    // Return only the safe check-screen fields — never the numbers
    return res.status(200).json({
      status: "allowed",
      submissionId,
      checkPayload: {
        readAs:    llmResponse.readAs,
        family:    llmResponse.family,
        kind:      llmResponse.kind,
        reasoning: llmResponse.reasoning,
        anchors:   llmResponse.anchors,
      },
    });

  } catch (err) {
    console.error("api2/check error:", err);
    return res.status(500).json({ status: "error", error: err.message || "Server error" });
  }
};
