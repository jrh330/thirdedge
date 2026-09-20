'use strict';

/**
 * POST /claim
 *
 * Accepts a pasted invite token (or full /j/TOKEN URL), claims it, sets the
 * session cookie, and redirects to `next` (validated) or /play.
 *
 * Rate-limited to 10 attempts per IP per minute (in-memory, sufficient for
 * a small playtest).
 */

const { getDb }    = require('./_db');
const { hashToken, signCookie, COOKIE_NAME, cookieOptions } = require('../auth/player');
const identityPage = require('./identity-page');
const { validateNext } = require('./route-utils');

// ── In-memory rate limiter ────────────────────────────────────────────────────

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;
const _limits = new Map(); // ip → { count, resetAt }

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = _limits.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
  }
  entry.count += 1;
  _limits.set(ip, entry);
  return entry.count <= MAX_ATTEMPTS;
}

// Periodically clear stale entries so the Map doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of _limits) {
    if (now > entry.resetAt) _limits.delete(ip);
  }
}, 5 * 60_000);

// ── Handler ───────────────────────────────────────────────────────────────────

module.exports = async function claim(req, res) {
  const ip   = req.ip || 'unknown';
  const next = validateNext(req.body?.next);

  if (!checkRateLimit(ip)) {
    return res.status(429).send(identityPage({
      heading: 'Too many attempts.',
      message: 'Please wait a minute and try again.',
      next,
      error: 'You\'ve tried too many times. Wait a minute.',
    }));
  }

  // Extract token: accept a full URL (/j/TOKEN or /join/TOKEN) or a bare token
  let raw = (req.body?.code || '').trim();
  const urlMatch = raw.match(/\/(?:j|join)\/([A-Za-z0-9_-]+)\s*$/);
  if (urlMatch) raw = urlMatch[1];

  if (!raw) {
    return res.status(400).send(identityPage({
      heading: 'This device isn\'t signed in.',
      next,
      error: 'Please paste your invite link or code.',
    }));
  }

  try {
    const tokenHash = hashToken(raw);
    const db = await getDb();
    const player = await db.collection('players').findOne({ tokenHash });

    if (!player) {
      return res.status(403).send(identityPage({
        heading: 'That code wasn\'t recognised.',
        message: 'Double-check the link Jonathan sent you, or ask for a new one.',
        next,
        error: 'Invite code not found.',
      }));
    }

    if (player.revokedAt) {
      return res.status(403).send(identityPage({
        heading: 'This invite isn\'t valid any more.',
        message: 'Ask Jonathan for a new link.',
        next,
        error: 'This invite has been revoked.',
      }));
    }

    const cookieValue = signCookie(player.id, player.sessionVersion);
    res.cookie(COOKIE_NAME, cookieValue, cookieOptions());
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, next || '/play');

  } catch (err) {
    console.error('claim error:', err);
    return res.status(500).send(identityPage({
      heading: 'Something went wrong.',
      message: 'Please try again.',
      next,
      error: 'Server error — please try again.',
    }));
  }
};
