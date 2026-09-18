"use strict";

/**
 * POST /api2/mint
 * Mint step: unseal → validate → insert card → return placement info.
 * Requires a submissionId from the preceding /api2/check call.
 *
 * Body: { submissionId }
 * Image: if a pending Cloudinary image exists in the seal, it is renamed
 * from allagaroo/pending/… to allagaroo/cards/{cardId} at mint time.
 */

const { getDb } = require("./_db");
const { consumeSeal } = require("./check");
const { cloudinary } = require("./_cloudinary");
const { COLLECTION_MAX, ACTIVE_SIZE, INACTIVE_MAX, FAMILY_MAX, SEVEN_ALLOWANCE } = require("../engine2/constants");
const { requirePlayer } = require("../auth/player");

// ── Collection placement helpers (inline from src/collection.js logic) ────────

function checkComposition(cards) {
  const fam = {};
  let sevens = 0;
  for (const c of cards) {
    fam[c.family] = (fam[c.family] || 0) + 1;
    if (c.carriesSeven) sevens++;
  }
  for (const [f, n] of Object.entries(fam)) {
    if (n > FAMILY_MAX) return { ok: false, reason: `Too many ${f} cards (${n} of ${FAMILY_MAX} max)` };
  }
  if (sevens > SEVEN_ALLOWANCE) return { ok: false, reason: `Too many sevens (${sevens} of ${SEVEN_ALLOWANCE} max)` };
  return { ok: true };
}

function legalSwapTargets(newCard, activeCards) {
  return activeCards
    .filter(existing => {
      const proposed = activeCards.filter(c => c.id !== existing.id).concat(newCard);
      return proposed.length === ACTIVE_SIZE && checkComposition(proposed).ok;
    })
    .map(c => ({
      id:      c.id,
      name:    c.name,
      family:  c.family,
      power:   c.power,
      speed:   c.speed,
      wits:    c.wits,
      imageUrl: c.imageUrl || null,
    }));
}

function placeMintedCard(newCard, activeCards, inactiveCount) {
  if (activeCards.length < ACTIVE_SIZE) {
    const result = checkComposition([...activeCards, newCard]);
    if (result.ok) return { placement: "active", activeCount: activeCards.length + 1 };
  }

  const swapOptions = legalSwapTargets(newCard, activeCards);

  const reasons = [];
  if (activeCards.length >= ACTIVE_SIZE) reasons.push("Your 12 active cards are full");
  if (activeCards.filter(c => c.carriesSeven).length >= SEVEN_ALLOWANCE && newCard.carriesSeven)
    reasons.push("already have 3 sevens");
  const famCount = activeCards.filter(c => c.family === newCard.family).length;
  if (famCount >= FAMILY_MAX) reasons.push(`already have 6 ${newCard.family} cards`);

  if (swapOptions.length === 0)
    return { placement: "inactive", reason: reasons.join(" and ") || "No legal swap available", inactiveCount: inactiveCount + 1 };

  return { placement: "choice", reason: reasons.join(" and "), swapOptions, inactiveCount: inactiveCount + 1 };
}

// ── Handler ───────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    let player;
    try {
      player = await requirePlayer(req);
    } catch (e) {
      if (e.status && e.body) return res.status(e.status).json(e.body);
      throw e;
    }

    const { submissionId, imageUrl } = req.body || {};
    if (!submissionId) return res.status(400).json({ error: "submissionId required" });

    // consumeSeal atomically deletes the seal, preventing duplicate mints from two tabs racing
    const seal = await consumeSeal(submissionId, player.id);
    if (!seal) return res.status(400).json({ error: "Sealed result not found or expired — did Check complete?" });

    const { ownerId, submission, fingerprint, carriesSeven, sealed, pendingImagePublicId } = seal;
    const db = await getDb();

    // Defence: re-check duplicate (edge case: two tabs minting at once)
    const dup = await db.collection("cardsv2").findOne({ ownerId, fingerprint });
    if (dup) {
      await deleteSeal(submissionId);
      return res.status(409).json({ error: "already_made", matchedName: dup.name });
    }

    // Move image from pending/ to cards/ in Cloudinary
    const cardId = crypto.randomUUID();
    let finalImageUrl = null;
    if (pendingImagePublicId) {
      try {
        const finalPublicId = `allagaroo/cards/${cardId}`;
        const renamed = await cloudinary.uploader.rename(pendingImagePublicId, finalPublicId);
        finalImageUrl = renamed.secure_url;
        console.log("mint: image moved to", finalPublicId);
      } catch (imgErr) {
        console.error("mint: image rename failed (non-fatal):", imgErr.message);
      }
    }

    // Build the card
    const card = {
      id:           cardId,
      ownerId,
      name:         submission.name,
      flavorText:   submission.flavorText,
      imageUrl:     finalImageUrl,
      power:        sealed.power,
      speed:        sealed.speed,
      wits:         sealed.wits,
      family:       sealed.family,
      kind:         sealed.kind,
      carriesSeven,
      aiReasoning:  sealed.reasoning,
      aiAnchors:    sealed.anchors,
      fingerprint,
      mintedAt:     new Date(),
      deleted:      false,
    };

    // Determine placement: load active + inactive counts
    const allCards = await db.collection("cardsv2")
      .find({ ownerId, deleted: { $ne: true } })
      .toArray();

    // Use Collection doc if it exists, otherwise fall back to all cards as active
    let collDoc = await db.collection("collectionsv2").findOne({ ownerId });
    if (!collDoc) {
      // Auto-create a Collection doc from existing cards
      const existingIds = allCards.map(c => c.id);
      const activeIds   = existingIds.slice(0, ACTIVE_SIZE);
      const inactiveIds = existingIds.slice(ACTIVE_SIZE);
      collDoc = { ownerId, active: activeIds, inactive: inactiveIds, savedDecks: [] };
      await db.collection("collectionsv2").insertOne(collDoc);
    }

    const activeCards   = allCards.filter(c => collDoc.active.includes(c.id));
    const inactiveCount = collDoc.inactive.length;
    const placement     = placeMintedCard(card, activeCards, inactiveCount);

    // Persist the card
    await db.collection("cardsv2").insertOne(card);

    // Auto-place into active if placement allows
    if (placement.placement === "active") {
      await db.collection("collectionsv2").updateOne(
        { ownerId },
        { $push: { active: card.id } }
      );
    } else {
      await db.collection("collectionsv2").updateOne(
        { ownerId },
        { $push: { inactive: card.id } }
      );
    }

    return res.status(200).json({ ok: true, card, placement });
  } catch (err) {
    console.error("api2/mint error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
};
