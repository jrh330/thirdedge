'use strict';

/**
 * Admin invite management routes.
 *
 * POST   /admin/invites          — create an invite (returns token + joinUrl)
 * DELETE /admin/invites/:token   — revoke an invite
 * POST   /admin/players/:id/restore — restore a revoked player
 */

const crypto = require('crypto');
const { getDb } = require('./_db');
const { generateToken, hashToken } = require('../auth/player');
const { giveSampleDeck } = require('./fill-test');

function checkAdminAuth(req, res) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  const provided    = req.headers['x-admin-secret'] || '';
  const secretBuf   = Buffer.from(secret);
  const providedBuf = Buffer.from(provided);
  if (secretBuf.length !== providedBuf.length || !crypto.timingSafeEqual(secretBuf, providedBuf)) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

/**
 * POST /admin/invites
 * Body: { name }
 * Stores the raw token in the player doc so the admin page can show the join URL.
 */
async function createInvite(req, res) {
  if (!checkAdminAuth(req, res)) return;

  const { name, withSampleDeck = true } = req.body || {};
  if (!name?.trim()) {
    return res.status(400).json({ error: 'name required' });
  }

  try {
    const token = generateToken();
    const tokenHash = hashToken(token);
    const baseUrl = process.env.PUBLIC_BASE_URL || `https://${req.hostname}`;

    const player = {
      id:                crypto.randomUUID(),
      name:              name.trim(),
      token,
      tokenHash,
      createdAt:         new Date(),
      revokedAt:         null,
      sessionVersion:    1,
      checkBlockedUntil: null,
      declineCount:      0,
    };

    const db = await getDb();
    await db.collection('players').insertOne(player);

    // Give 12 sample cards so the tester can play immediately on first visit.
    // Runs after player creation; failure is logged but doesn't block the invite.
    let samplesAdded = 0;
    if (withSampleDeck !== false) {
      try {
        const result = await giveSampleDeck(player.id, db);
        samplesAdded = result.added;
      } catch (sampleErr) {
        console.error('createInvite: giveSampleDeck failed for player', player.id, sampleErr.message);
      }
    }

    const joinUrl = `${baseUrl}/j/${token}`;
    return res.status(200).json({ token, joinUrl, id: player.id, name: player.name, samplesAdded });

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

/**
 * POST /admin/players/:id/restore
 * Clears revokedAt so the player can log in again.
 */
async function restorePlayer(req, res) {
  if (!checkAdminAuth(req, res)) return;

  const { id } = req.params;
  try {
    const db = await getDb();
    const result = await db.collection('players').updateOne(
      { id },
      { $set: { revokedAt: null } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('restorePlayer error:', err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * POST /admin/players/:id/give-samples
 * Tops up the player to 12 sample cards.
 */
async function giveSamplesAdmin(req, res) {
  if (!checkAdminAuth(req, res)) return;
  const { id } = req.params;
  try {
    const db = await getDb();
    const player = await db.collection('players').findOne({ id });
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const result = await giveSampleDeck(id, db);
    return res.json({ ok: true, added: result.added, total: result.total });
  } catch (err) {
    console.error('giveSamplesAdmin error:', err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * POST /admin/players/:id/clear-samples
 * Removes all source:"sample" cards and repairs the collection.
 * Blocked if player is in a live match.
 */
async function clearSamplesAdmin(req, res) {
  if (!checkAdminAuth(req, res)) return;
  const { id } = req.params;
  try {
    const db = await getDb();
    const player = await db.collection('players').findOne({ id });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const liveGame = await db.collection('gamesv2').findOne({
      $or: [{ 'p1.id': id }, { 'p2.id': id }],
      status: { $in: ['waiting', 'playing'] },
    });
    if (liveGame) return res.status(409).json({ error: 'Player is in a live match — cannot clear samples' });

    const sampleCards = await db.collection('cardsv2')
      .find({ ownerId: id, source: 'sample', deleted: { $ne: true } })
      .project({ id: 1 })
      .toArray();
    const sampleIds = sampleCards.map(c => c.id);
    if (sampleIds.length === 0) return res.json({ ok: true, removed: 0 });

    await db.collection('cardsv2').deleteMany({ ownerId: id, source: 'sample' });

    const coll = await db.collection('collectionsv2').findOne({ ownerId: id });
    if (coll) {
      const sampleSet = new Set(sampleIds);
      await db.collection('collectionsv2').updateOne(
        { ownerId: id },
        { $set: {
          active:   (coll.active   || []).filter(x => !sampleSet.has(x)),
          inactive: (coll.inactive || []).filter(x => !sampleSet.has(x)),
          updatedAt: new Date(),
        }}
      );
    }

    return res.json({ ok: true, removed: sampleIds.length });
  } catch (err) {
    console.error('clearSamplesAdmin error:', err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * POST /admin/players/:id/reset
 * Bumps sessionVersion (forces logout), wipes all cards and collection.
 */
async function resetPlayer(req, res) {
  if (!checkAdminAuth(req, res)) return;
  const { id } = req.params;
  try {
    const db = await getDb();
    const player = await db.collection('players').findOne({ id });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    await db.collection('players').updateOne({ id }, { $inc: { sessionVersion: 1 } });
    await db.collection('cardsv2').deleteMany({ ownerId: id });
    await db.collection('collectionsv2').updateOne(
      { ownerId: id },
      { $set: { active: [], inactive: [], savedDecks: [], lastDeletedAt: null, updatedAt: new Date() } }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('resetPlayer error:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { createInvite, revokeInvite, restorePlayer, giveSamplesAdmin, clearSamplesAdmin, resetPlayer };
