'use strict';

/**
 * GET /join/:token
 * Validates an invite token and sets a session cookie, then redirects to /mint.
 */

const { getDb } = require('./_db');
const { hashToken, signCookie, COOKIE_NAME, cookieOptions } = require('../auth/player');

module.exports = async function joinInvite(req, res) {
  const { token } = req.params;

  if (!token) {
    return res.status(400).send(noInviteHtml());
  }

  try {
    const tokenHash = hashToken(token);
    const db = await getDb();
    const player = await db.collection('players').findOne({ tokenHash });

    if (!player || player.revokedAt) {
      return res.status(403).send(noInviteHtml());
    }

    const cookieValue = signCookie(player.id, player.sessionVersion);
    res.cookie(COOKIE_NAME, cookieValue, cookieOptions());
    res.setHeader('Referrer-Policy', 'no-referrer');
    return res.redirect(302, '/mint');

  } catch (err) {
    console.error('join-invite error:', err);
    return res.status(500).send(noInviteHtml());
  }
};

function noInviteHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Allagaroo</title></head>
<body>
<p>You need an invite link to play Allagaroo.</p>
</body>
</html>`;
}
