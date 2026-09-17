'use strict';

/**
 * auth/player.js — Single source of truth for player identity.
 *
 * Exports:
 *   generateToken()        → 32 random bytes as base64url string
 *   hashToken(token)       → SHA-256 hex digest
 *   signCookie(playerId, sessionVersion) → "b64url(playerId).version.hmac"
 *   verifyCookie(value)    → { playerId, sessionVersion } or null
 *   requirePlayer(req)     → player object or throws { status, body }
 *   DEV_PLAYER_ID          = "dev-player-000"
 */

const crypto = require('crypto');
const { getDb } = require('../api2/_db');

// ── Production safety guard ────────────────────────────────────────────────────
// Refuse to start if dangerous dev flags are set in production.
if (process.env.NODE_ENV === 'production') {
  if (process.env.DEV_FAKE_PLAYER === 'true') {
    throw new Error('DEV_FAKE_PLAYER must not be set in production');
  }
  if (process.env.DEV_FAKE_AI === 'true') {
    throw new Error('DEV_FAKE_AI must not be set in production');
  }
}

const COOKIE_NAME    = 'alg_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';

const DEV_PLAYER_ID = 'dev-player-000';

// ── Token helpers ──────────────────────────────────────────────────────────────

/**
 * Generate a 32-byte random token as base64url.
 * @returns {string}
 */
function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Hash a token to its SHA-256 hex digest.
 * @param {string} token
 * @returns {string}
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── Cookie signing ─────────────────────────────────────────────────────────────

/**
 * Sign a session cookie.
 * Format: base64url(playerId) + "." + sessionVersion + "." + hmac
 *
 * @param {string} playerId
 * @param {number} sessionVersion
 * @returns {string}
 */
function signCookie(playerId, sessionVersion) {
  const encoded = Buffer.from(playerId).toString('base64url');
  const hmac = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${playerId}.${sessionVersion}`)
    .digest('base64url');
  return `${encoded}.${sessionVersion}.${hmac}`;
}

/**
 * Verify a session cookie value.
 * Returns { playerId, sessionVersion } on success, or null on failure.
 *
 * @param {string} cookieValue
 * @returns {{ playerId: string, sessionVersion: number }|null}
 */
function verifyCookie(cookieValue) {
  if (!cookieValue || typeof cookieValue !== 'string') return null;

  const parts = cookieValue.split('.');
  if (parts.length !== 3) return null;

  const [encoded, versionStr, providedHmac] = parts;
  const sessionVersion = parseInt(versionStr, 10);
  if (isNaN(sessionVersion)) return null;

  let playerId;
  try {
    playerId = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const expectedHmac = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${playerId}.${sessionVersion}`)
    .digest('base64url');

  // Timing-safe comparison
  const a = Buffer.from(providedHmac);
  const b = Buffer.from(expectedHmac);
  if (a.length !== b.length) return null;

  try {
    if (!crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  return { playerId, sessionVersion };
}

// ── Cookie options ─────────────────────────────────────────────────────────────

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 90 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
  };
}

/**
 * Set the alg_session cookie on a response.
 *
 * @param {object} res    — Express response
 * @param {string} playerId
 * @param {number} sessionVersion
 */
function setSessionCookie(res, playerId, sessionVersion) {
  res.cookie(COOKIE_NAME, signCookie(playerId, sessionVersion), cookieOptions());
}

// ── requirePlayer ──────────────────────────────────────────────────────────────

/**
 * Extract and validate the current player from a request.
 *
 * In DEV_FAKE_PLAYER mode (non-production only): upserts and returns the dev player.
 *
 * Otherwise:
 *   1. Reads and verifies the alg_session cookie.
 *   2. Looks up the player in MongoDB.
 *   3. Rejects if not found, revokedAt is set, or sessionVersion doesn't match.
 *
 * Throws { status: 401, body: { error: "no_session" } } on any failure.
 *
 * @param {import('express').Request} req
 * @returns {Promise<object>}  — player document
 */
async function requirePlayer(req) {
  // Dev bypass — never available in production (guard above prevents it)
  if (process.env.DEV_FAKE_PLAYER === 'true' && process.env.NODE_ENV !== 'production') {
    const db = await getDb();
    const devPlayer = {
      id:             DEV_PLAYER_ID,
      name:           'Dev Player',
      tokenHash:      null,
      createdAt:      new Date(),
      revokedAt:      null,
      sessionVersion: 1,
      checkBlockedUntil: null,
      declineCount:   0,
    };
    await db.collection('players').updateOne(
      { id: DEV_PLAYER_ID },
      { $setOnInsert: devPlayer },
      { upsert: true }
    );
    const player = await db.collection('players').findOne({ id: DEV_PLAYER_ID });
    return player;
  }

  // Read cookie
  const cookieValue = req.cookies?.[COOKIE_NAME];
  const parsed = verifyCookie(cookieValue);

  if (!parsed) {
    throw { status: 401, body: { error: 'no_session' } };
  }

  const { playerId, sessionVersion } = parsed;

  // Look up in DB
  const db = await getDb();
  const player = await db.collection('players').findOne({ id: playerId });

  if (!player) {
    throw { status: 401, body: { error: 'no_session' } };
  }
  if (player.revokedAt) {
    throw { status: 401, body: { error: 'no_session' } };
  }
  if (player.sessionVersion !== sessionVersion) {
    throw { status: 401, body: { error: 'no_session' } };
  }

  return player;
}

module.exports = {
  DEV_PLAYER_ID,
  generateToken,
  hashToken,
  signCookie,
  verifyCookie,
  cookieOptions,
  setSessionCookie,
  requirePlayer,
  COOKIE_NAME,
};
