'use strict';

const { getDb }         = require('./_db');
const { requirePlayer } = require('../auth/player');
const { logEvent }      = require('./_events');

// ── GET /api2/player ──────────────────────────────────────────────────────────
// Returns the current player's public profile (id + name).

async function getPlayer(req, res) {
  let player;
  try { player = await requirePlayer(req); }
  catch (e) { if (e.status && e.body) return res.status(e.status).json(e.body); throw e; }

  return res.json({ id: player.id, name: player.name });
}

// ── PUT /api2/player/name ─────────────────────────────────────────────────────
// Body: { name }  — updates the player's display name.

async function updateName(req, res) {
  let player;
  try { player = await requirePlayer(req); }
  catch (e) { if (e.status && e.body) return res.status(e.status).json(e.body); throw e; }

  const { name } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name required' });
  }
  const trimmed = name.trim().slice(0, 40); // max 40 chars

  try {
    const db = await getDb();
    await db.collection('players').updateOne(
      { id: player.id },
      { $set: { name: trimmed } }
    );
    logEvent(player.id, 'name_set');
    return res.json({ ok: true, name: trimmed });
  } catch (err) {
    console.error('updateName error:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { getPlayer, updateName };
