"use strict";

/**
 * POST /api2/fetch-preview
 * Server-side image proxy for "paste a link" on the Make screen.
 *
 * Guard rails:
 *   - HTTPS only
 *   - Hostname / resolved IP must not be loopback, private or link-local
 *   - Post-redirect IP check (DNS rebinding / open-redirect guard)
 *   - 8-second timeout
 *   - 10 MB size cap
 *   - Content-Type must be image/*
 *
 * Returns the raw image bytes with the original Content-Type, so the client
 * can create a Blob and feed it into the Crop screen.
 */

const dns = require("dns").promises;
const { URL } = require("url");

const MAX_SIZE   = 10 * 1024 * 1024; // 10 MB
const TIMEOUT_MS = 8_000;

const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0$|::1$|fc|fd)/i;

function isPrivate(ip) {
  return PRIVATE_IP_RE.test(ip);
}

async function resolveHostname(hostname) {
  const results = await dns.lookup(hostname, { all: true });
  return results.map(r => r.address);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { url } = req.body || {};
  if (!url || typeof url !== "string")
    return res.status(400).json({ error: "url required" });

  // ── Parse and validate ────────────────────────────────────────────────────
  let parsed;
  try { parsed = new URL(url.trim()); }
  catch { return res.status(400).json({ error: "That doesn't look like a valid link" }); }

  if (parsed.protocol !== "https:")
    return res.status(400).json({ error: "Only https:// links are supported" });

  const hostname = parsed.hostname.toLowerCase();
  if (["localhost", "0.0.0.0", "127.0.0.1", "::1", "[::1]"].includes(hostname))
    return res.status(400).json({ error: "That address isn't allowed" });

  // ── DNS check ─────────────────────────────────────────────────────────────
  let addrs;
  try { addrs = await resolveHostname(hostname); }
  catch { return res.status(400).json({ error: "Couldn't reach that address" }); }

  if (addrs.some(isPrivate))
    return res.status(400).json({ error: "That address isn't allowed" });

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(parsed.href, {
      signal:  controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Allagaroo-CardMaker/1.0" },
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError")
      return res.status(400).json({ error: "That link took too long to respond" });
    return res.status(400).json({ error: "Couldn't reach that link" });
  }
  clearTimeout(timer);

  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      return res.status(400).json({ error: "That picture needs a login to view" });
    return res.status(400).json({ error: `Link returned ${response.status} — can't fetch it` });
  }

  // ── Post-redirect IP check (open-redirect / DNS rebinding guard) ──────────
  if (response.url && response.url !== parsed.href) {
    try {
      const finalHostname = new URL(response.url).hostname.toLowerCase();
      if (finalHostname !== hostname) {
        const finalAddrs = await resolveHostname(finalHostname);
        if (finalAddrs.some(isPrivate))
          return res.status(400).json({ error: "That address isn't allowed" });
      }
    } catch { /* non-fatal */ }
  }

  // ── Content-Type check ────────────────────────────────────────────────────
  const ct = (response.headers.get("content-type") || "").toLowerCase();
  if (!ct.startsWith("image/"))
    return res.status(400).json({ error: "That link doesn't point to an image" });

  // ── Stream body with size cap ─────────────────────────────────────────────
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_SIZE) {
        reader.cancel();
        return res.status(400).json({ error: "That image is too large (max 10 MB)" });
      }
      chunks.push(Buffer.from(value));
    }
  } catch {
    return res.status(400).json({ error: "Download failed — try again" });
  }

  const buf = Buffer.concat(chunks);
  res.setHeader("Content-Type", ct.split(";")[0].trim());
  res.setHeader("Content-Length", buf.length);
  return res.status(200).send(buf);
};
