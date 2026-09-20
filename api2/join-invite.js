'use strict';

/**
 * GET /j/:token  (and legacy alias GET /join/:token)
 *
 * Validates an invite token, sets the session cookie, and redirects.
 *
 * Rules:
 *  - 302 only — never 301 (would be cached in browsers forever).
 *  - Cache-Control: no-store on every response.
 *  - Referrer-Policy: no-referrer so the token doesn't leak.
 *  - Never log the full token — log only the first 8 characters.
 *  - ?next= is validated against the strict allowlist in route-utils.
 */

const { getDb } = require('./_db');
const { hashToken, signCookie, verifyCookie, COOKIE_NAME, cookieOptions } = require('../auth/player');
const identityPage  = require('./identity-page');
const { confirmPage } = require('./identity-page');
const { validateNext } = require('./route-utils');
const { logEvent } = require('./_events');

module.exports = async function joinInvite(req, res) {
  // Always set these — even on error responses
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');

  const { token } = req.params;
  const next = validateNext(req.query.next);

  if (!token) {
    return res.status(400).send(identityPage({
      heading: 'This device isn\'t signed in.',
      next,
    }));
  }

  try {
    const tokenHash = hashToken(token);
    const db = await getDb();
    const player = await db.collection('players').findOne({ tokenHash });

    if (!player) {
      // Log only the first 8 chars — enough to correlate with admin logs
      console.warn('join-invite: token not found [%s…]', token.slice(0, 8));
      return res.status(403).send(identityPage({
        heading: 'This invite isn\'t valid any more.',
        message: 'The link may have expired or already been used on another account.',
        next,
        error: 'Invite not recognised. Ask Jonathan for a new link.',
      }));
    }

    if (player.revokedAt) {
      console.warn('join-invite: revoked token [%s…] player=%s', token.slice(0, 8), player.id);
      return res.status(403).send(identityPage({
        heading: 'This invite isn\'t valid any more.',
        message: 'Your access has been revoked. Ask Jonathan if you think this is a mistake.',
        next,
        error: 'This invite has been revoked.',
      }));
    }

    // Check whether this device already has a valid session for this player.
    // If yes → re-issue the cookie silently and redirect (handles bookmark/repeat visits).
    // If no  → show "Continue as [name]?" so the visitor can confirm they are who
    //           the link says they are (prevents group-chat links signing in the wrong person).
    const existingSession = verifyCookie(req.cookies?.[COOKIE_NAME]);
    const alreadySignedIn = existingSession?.playerId === player.id;

    logEvent(player.id, 'invite_opened');

    if (!alreadySignedIn) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(confirmPage({
        playerName: player.name,
        token,
        next,
      }));
    }

    const cookieValue = signCookie(player.id, player.sessionVersion);
    res.cookie(COOKIE_NAME, cookieValue, cookieOptions());
    return res.redirect(302, next);

  } catch (err) {
    console.error('join-invite error:', err.message);
    return res.status(500).send(identityPage({
      heading: 'Something went wrong.',
      message: 'Please try again, or ask Jonathan for help.',
      next,
    }));
  }
};
