'use strict';

/**
 * Admin invite management routes.
 *
 * POST   /admin/invites       — create an invite (returns token + joinUrl)
 * DELETE /admin/invites/:token — revoke an invite
 */

const { getDb } = require('./_db');
const { generateToken, hashToken } = require('../auth/player');

function checkAdminAuth(req, res) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers['x-admin-secret'] !== secret) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

/**
 * POST /admin/invites
 * Body: { name }
 */
async function createInvite(req, res) {
  if (!checkAdminAuth(req, res)) return;

  const { name } = req.body || {};
  if (!name?.trim()) {
    return res.status(400).json({ error: 'name required' });
  }

  try {
    const token = generateToken();
    const tokenHash = hashToken(token);
    const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';

    const player = {
      id:                crypto.randomUUID(),
      name:              name.trim(),
      tokenHash,
      createdAt:         new Date(),
      revokedAt:         null,
      sessionVersion:    1,
      checkBlockedUntil: null,
      declineCount:      0,
    };

    const db = await getDb();
    await db.collection('players').insertOne(player);

    const joinUrl = `${baseUrl}/join/${token}`;
    return res.status(200).json({ token, joinUrl });

  } catch (err) {
    console.error('createInvite error:', err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * DELETE /admin/invites/:token
 */
async function revokeInvite(req, res) {
  if (!checkAdminAuth(req, res)) return;

  const { token } = req.params;
  if (!token) {
    return res.status(400).json({ error: 'token required' });
  }

  try {
    const tokenHash = hashToken(token);
    const db = await getDb();
    const result = await db.collection('players').updateOne(
      { tokenHash },
      { $set: { revokedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('revokeInvite error:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { createInvite, revokeInvite };
