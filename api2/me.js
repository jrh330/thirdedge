'use strict';

/**
 * GET /api2/me
 *
 * The single source of truth the client branches on. Returns:
 *
 * {
 *   player:    { id, name },
 *   needsName: boolean,
 *   cards:     { total, active, inactive, samples },
 *   pending:   number,
 *   liveMatch: { code, role, startedAt } | null,
 *   nextStep:  "welcome" | "name" | "make" | "play" | "resume" | "collection_full"
 * }
 *
 * 401 → { error: "no_session" }   (shape unchanged for existing callers)
 *
 * Also exported as a plain function (buildMe) so the admin endpoint
 * GET /admin/players/:id/state can reuse the same logic.
 */

const { getDb }         = require('./_db');
const { requirePlayer } = require('../auth/player');
const { ACTIVE_SIZE, COLLECTION_MAX } = require('../engine2/constants');

// ── Core logic ────────────────────────────────────────────────────────────────

/**
 * Build the /me payload for a given playerId.
 * Accepts the player document so callers that already loaded it avoid a
 * second DB round-trip.
 *
 * @param {object} player  — player document from the players collection
 * @returns {Promise<object>}
 */
async function buildMe(player) {
  const db = await getDb();
  const playerId = player.id;

  // ── 1. Cards ───────────────────────────────────────────────────────────────
  const allCards = await db.collection('cardsv2')
    .find({ ownerId: playerId, deleted: { $ne: true } })
    .project({ id: 1, isTestCard: 1, _id: 0 })
    .toArray();

  const totalCards   = allCards.length;
  const sampleCards  = allCards.filter(c => c.isTestCard).length;
  const cardIds      = new Set(allCards.map(c => c.id));

  // ── 2. Collection document (active / inactive split) ──────────────────────
  let activeCount   = 0;
  let inactiveCount = 0;

  const collDoc = await db.collection('collectionsv2').findOne({ ownerId: playerId });
  if (collDoc) {
    // Only count cards that still exist (haven't been deleted since the doc was written)
    activeCount   = collDoc.active.filter(id => cardIds.has(id)).length;
    inactiveCount = collDoc.inactive.filter(id => cardIds.has(id)).length;
  }

  // ── 3. Live match ─────────────────────────────────────────────────────────
  // A match is "live" if it isn't complete and the player is one of the two seats.
  const liveGame = await db.collection('gamesv2').findOne({
    status: { $ne: 'complete' },
    $or: [{ 'p1.id': playerId }, { 'p2.id': playerId }],
  });

  let liveMatch = null;
  if (liveGame) {
    liveMatch = {
      code:      liveGame.code,
      role:      liveGame.p1?.id === playerId ? 'creator' : 'joiner',
      startedAt: liveGame.createdAt ? new Date(liveGame.createdAt).getTime() : null,
    };
  }

  // ── 4. Derived fields ─────────────────────────────────────────────────────
  const needsName = !player.name || !player.name.trim();

  const nextStep = deriveNextStep({
    liveMatch,
    totalCards,
    activeCount,
    needsName,
    collectionMax: COLLECTION_MAX,
    activeSize:    ACTIVE_SIZE,
  });

  return {
    player:    { id: playerId, name: player.name || '' },
    needsName,
    cards: {
      total:    totalCards,
      active:   activeCount,
      inactive: inactiveCount,
      samples:  sampleCards,
    },
    pending:   0,   // reserved for future check-queue tracking
    liveMatch,
    nextStep,
  };
}

/**
 * Derive nextStep from the current state.
 * Priority: resume > collection_full > name > welcome > play > make
 */
function deriveNextStep({ liveMatch, totalCards, activeCount, needsName, collectionMax, activeSize }) {
  if (liveMatch)                    return 'resume';
  if (totalCards >= collectionMax)  return 'collection_full';
  if (needsName)                    return 'name';
  if (totalCards === 0)             return 'welcome';
  if (activeCount >= activeSize)    return 'play';
  return 'make';
}

// ── Route handler ─────────────────────────────────────────────────────────────

async function getMe(req, res) {
  let player;
  try { player = await requirePlayer(req); }
  catch (e) {
    if (e.status && e.body) return res.status(e.status).json(e.body);
    throw e;
  }

  try {
    const payload = await buildMe(player);
    return res.json(payload);
  } catch (err) {
    console.error('GET /api2/me error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getMe, buildMe };
