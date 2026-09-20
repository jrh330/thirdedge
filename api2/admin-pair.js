'use strict';

/**
 * Admin pairing and match management routes.
 *
 * POST /admin/pair              — create a match between two players, return two deep links
 * GET  /admin/matches           — list all active / waiting matches
 * POST /admin/matches/:code/end — force-end a match
 */

const crypto = require('crypto');
const { getDb } = require('./_db');
const { genRoomCode } = require('./_utils');
const { createMatch } = require('../engine2/match');
const { RULE_SET } = require('../engine2/constants');
const { validateDeck } = require('../engine2/validate');
const { logEvent } = require('./_events');

// Secret-based auth — for destructive/sensitive actions (pair, force-end)
function checkAdminAuth(req, res) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) { res.status(401).json({ error: 'unauthorized' }); return false; }
  const provided    = req.headers['x-admin-secret'] || '';
  const secretBuf   = Buffer.from(secret);
  const providedBuf = Buffer.from(provided);
  if (secretBuf.length !== providedBuf.length || !crypto.timingSafeEqual(secretBuf, providedBuf)) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

// Cookie-based auth — for read-only listing (same as admin-page.js isAdminAuthed)
const { isAdminAuthed: _isAdminAuthed } = (() => {
  // Inline the same logic so we don't create a circular dependency
  const ADMIN_COOKIE = 'alg_admin';
  function isAdminAuthed(req) {
    const secret = process.env.ADMIN_SECRET;
    if (!secret) return false;
    const cookie = req.cookies?.[ADMIN_COOKIE];
    if (!cookie) return false;
    const expected = crypto.createHmac('sha256', secret).update('admin-session').digest('base64url');
    const a = Buffer.from(cookie);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    try { return crypto.timingSafeEqual(a, b); } catch { return false; }
  }
  return { isAdminAuthed };
})();

async function resolvePlayerCollection(playerId, db) {
  const coll = await db.collection('collectionsv2').findOne({ ownerId: playerId });
  if (!coll || !coll.active?.length) throw new Error('Player has no active collection');
  const cards = await db.collection('cardsv2')
    .find({ id: { $in: coll.active }, deleted: { $ne: true } })
    .toArray();
  const byId = Object.fromEntries(cards.map(c => [c.id, c]));
  const resolved = coll.active.map(id => {
    const card = byId[id];
    if (!card) throw new Error(`Card not found: ${id}`);
    return card;
  });
  const v = validateDeck(resolved, RULE_SET.FAMILY_WHEEL);
  if (!v.ok) throw new Error(`Collection isn't a legal deck: ${v.errors.join('; ')}`);
  return resolved;
}

async function pairPlayers(req, res) {
  if (!checkAdminAuth(req, res)) return;

  const { p1Id, p2Id } = req.body || {};
  if (!p1Id || !p2Id) return res.status(400).json({ error: 'p1Id and p2Id required' });
  if (p1Id === p2Id) return res.status(400).json({ error: 'Cannot pair a player with themselves' });

  try {
    const db = await getDb();
    const [p1, p2] = await Promise.all([
      db.collection('players').findOne({ id: p1Id }),
      db.collection('players').findOne({ id: p2Id }),
    ]);
    if (!p1) return res.status(404).json({ error: 'Player 1 not found' });
    if (!p2) return res.status(404).json({ error: 'Player 2 not found' });
    if (p1.revokedAt) return res.status(400).json({ error: `${p1.name} is revoked` });
    if (p2.revokedAt) return res.status(400).json({ error: `${p2.name} is revoked` });

    let deckA, deckB;
    try {
      [deckA, deckB] = await Promise.all([
        resolvePlayerCollection(p1Id, db),
        resolvePlayerCollection(p2Id, db),
      ]);
    } catch (deckErr) {
      return res.status(400).json({ error: deckErr.message });
    }

    // Generate unique room code
    const games = db.collection('gamesv2');
    let code;
    let attempts = 0;
    do {
      code = genRoomCode();
      const exists = await games.findOne({ code, status: { $ne: 'complete' } });
      if (!exists) break;
      attempts++;
    } while (attempts < 20);
    if (attempts >= 20) return res.status(500).json({ error: 'Could not generate room code' });

    const matchState = createMatch(code, p1Id, deckA, p2Id, deckB, RULE_SET.FAMILY_WHEEL);

    await games.insertOne({
      code,
      status:     'playing',
      p1:         { id: p1Id, name: p1.name },
      p2:         { id: p2Id, name: p2.name },
      matchState,
      createdAt:  new Date(),
      updatedAt:  new Date(),
    });

    logEvent(p1Id, 'match_created', { matchCode: code, pairedByAdmin: true });
    logEvent(p2Id, 'match_joined',  { matchCode: code, pairedByAdmin: true });

    const baseUrl  = process.env.PUBLIC_BASE_URL || `https://${req.hostname}`;
    const gamePath = `/g/${code}`;

    // Deep links work on cold devices: j/:token?next=/g/CODE claims the session then lands in the match
    const p1Link = p1.token ? `${baseUrl}/j/${p1.token}?next=${gamePath}` : `${baseUrl}${gamePath}`;
    const p2Link = p2.token ? `${baseUrl}/j/${p2.token}?next=${gamePath}` : `${baseUrl}${gamePath}`;

    return res.json({ code, p1Name: p1.name, p2Name: p2.name, p1Link, p2Link });
  } catch (err) {
    console.error('pairPlayers error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function listMatches(req, res) {
  if (!_isAdminAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const db = await getDb();
    const games = await db.collection('gamesv2')
      .find({ status: { $in: ['waiting', 'playing'] } })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    const result = games.map(g => {
      const ms       = g.matchState;
      const roundNum = ms?.rounds?.length ?? 0;
      const curRound = ms?.rounds?.[roundNum - 1];
      return {
        code:      g.code,
        status:    g.status,
        p1:        g.p1 ? { id: g.p1.id, name: g.p1.name } : null,
        p2:        g.p2 ? { id: g.p2.id, name: g.p2.name } : null,
        round:     roundNum,
        phase:     curRound?.phase ?? null,
        ageMs:     Date.now() - new Date(g.createdAt).getTime(),
        createdAt: g.createdAt,
      };
    });

    return res.json(result);
  } catch (err) {
    console.error('listMatches error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function forceEndMatch(req, res) {
  if (!checkAdminAuth(req, res)) return;
  const { code } = req.params;
  try {
    const db = await getDb();
    const result = await db.collection('gamesv2').updateOne(
      { code: code.toUpperCase(), status: { $in: ['waiting', 'playing'] } },
      { $set: { status: 'complete', updatedAt: new Date(), forceEndedAt: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Match not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('forceEndMatch error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function forceEndAllMatches(req, res) {
  if (!checkAdminAuth(req, res)) return;
  try {
    const db = await getDb();
    const result = await db.collection('gamesv2').updateMany(
      { status: { $in: ['waiting', 'playing'] } },
      { $set: { status: 'complete', updatedAt: new Date(), forceEndedAt: new Date() } }
    );
    return res.json({ ok: true, ended: result.modifiedCount });
  } catch (err) {
    console.error('forceEndAllMatches error:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { pairPlayers, listMatches, forceEndMatch, forceEndAllMatches };
