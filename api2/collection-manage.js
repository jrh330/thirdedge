"use strict";

/**
 * Collection management routes.
 *
 * GET  /api2/collection-state?ownerId=X  — full collection with active/inactive
 * POST /api2/collection/swap             — swap an active card for an inactive one
 * POST /api2/collection/swap-deck        — load a saved deck
 * POST /api2/collection/save-deck        — save a named deck
 * DELETE /api2/cards/:cardId?ownerId=X   — delete a card (5-min cooldown)
 */

const { getDb } = require("./_db");
const {
  ACTIVE_SIZE, INACTIVE_MAX, FAMILY_MAX, SEVEN_ALLOWANCE,
  SAVED_DECKS_MAX, COLLECTION_MAX, DELETE_COOLDOWN_MS,
} = require("../engine2/constants");
const { requirePlayer } = require("../auth/player");

// Pull in constants that might not be in engine2/constants yet
const _DELETE_COOLDOWN_MS = typeof DELETE_COOLDOWN_MS !== "undefined"
  ? DELETE_COOLDOWN_MS
  : 300_000;
const _SAVED_DECKS_MAX = typeof SAVED_DECKS_MAX !== "undefined"
  ? SAVED_DECKS_MAX
  : 5;

function checkActiveLegality(cards) {
  if (cards.length !== ACTIVE_SIZE)
    return { ok: false, reason: `Active deck must have exactly ${ACTIVE_SIZE} cards (has ${cards.length})` };
  const fam = {};
  let sevens = 0;
  for (const c of cards) {
    fam[c.family] = (fam[c.family] || 0) + 1;
    if (c.carriesSeven) sevens++;
  }
  for (const [f, n] of Object.entries(fam)) {
    if (n > FAMILY_MAX) return { ok: false, reason: `Too many ${f} cards (${n} of ${FAMILY_MAX} max)` };
  }
  if (sevens > SEVEN_ALLOWANCE)
    return { ok: false, reason: `Too many sevens (${sevens} of ${SEVEN_ALLOWANCE} max)` };
  return { ok: true };
}

// ── GET /api2/collection-state ────────────────────────────────────────────────
async function getCollectionState(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  let player;
  try {
    player = await requirePlayer(req);
  } catch (e) {
    if (e.status && e.body) return res.status(e.status).json(e.body);
    throw e;
  }
  const ownerId = player.id;

  try {
    const db = await getDb();
    const allCards = await db.collection("cardsv2")
      .find({ ownerId, deleted: { $ne: true } })
      .toArray();

    let collDoc = await db.collection("collectionsv2").findOne({ ownerId });
    if (!collDoc) {
      const ids      = allCards.map(c => c.id);
      const active   = ids.slice(0, ACTIVE_SIZE);
      const inactive = ids.slice(ACTIVE_SIZE);
      collDoc = { ownerId, active, inactive, savedDecks: [], lastDeletedAt: null };
      await db.collection("collectionsv2").insertOne(collDoc);
    }

    const byId       = Object.fromEntries(allCards.map(c => [c.id, c]));
    const activeCards   = collDoc.active.map(id => byId[id]).filter(Boolean);
    const inactiveCards = collDoc.inactive.map(id => byId[id]).filter(Boolean);
    const legality = checkActiveLegality(activeCards);

    return res.status(200).json({
      active:     activeCards,
      inactive:   inactiveCards,
      savedDecks: collDoc.savedDecks || [],
      loadedDeckId: collDoc.loadedDeckId || null,
      lastDeletedAt: collDoc.lastDeletedAt || null,
      legality,
      counts: {
        total: allCards.length,
        active: activeCards.length,
        inactive: inactiveCards.length,
        collectionMax: COLLECTION_MAX,
        activeSize: ACTIVE_SIZE,
        inactiveMax: INACTIVE_MAX,
      },
    });
  } catch (err) {
    console.error("getCollectionState error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// ── POST /api2/collection/swap ────────────────────────────────────────────────
async function swapCards(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  let player;
  try {
    player = await requirePlayer(req);
  } catch (e) {
    if (e.status && e.body) return res.status(e.status).json(e.body);
    throw e;
  }
  const ownerId = player.id;

  const { outId, inId } = req.body || {};
  if (!outId || !inId)
    return res.status(400).json({ error: "outId, inId required" });

  try {
    const db   = await getDb();
    const coll = await db.collection("collectionsv2").findOne({ ownerId });
    if (!coll) return res.status(404).json({ error: "Collection not found" });

    if (!coll.active.includes(outId))
      return res.status(400).json({ error: `Card ${outId} is not in active` });
    if (!coll.inactive.includes(inId))
      return res.status(400).json({ error: `Card ${inId} is not in inactive` });

    // Load full card objects for legality check
    const allIds   = [...coll.active, ...coll.inactive];
    const allCards = await db.collection("cardsv2")
      .find({ id: { $in: allIds }, deleted: { $ne: true } })
      .toArray();
    const byId = Object.fromEntries(allCards.map(c => [c.id, c]));

    const newActive   = coll.active.filter(id => id !== outId).concat(inId);
    const newInactive = coll.inactive.filter(id => id !== inId).concat(outId);
    const newActiveCards = newActive.map(id => byId[id]).filter(Boolean);

    const legality = checkActiveLegality(newActiveCards);
    if (!legality.ok) return res.status(400).json({ ok: false, reason: legality.reason });

    await db.collection("collectionsv2").updateOne(
      { ownerId },
      { $set: { active: newActive, inactive: newInactive } }
    );

    return res.status(200).json({ ok: true, active: newActive, inactive: newInactive });
  } catch (err) {
    console.error("swapCards error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// ── POST /api2/collection/save-deck ──────────────────────────────────────────
async function saveDeck(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  let player;
  try {
    player = await requirePlayer(req);
  } catch (e) {
    if (e.status && e.body) return res.status(e.status).json(e.body);
    throw e;
  }
  const ownerId = player.id;

  const { name, overwriteId } = req.body || {};
  if (!name?.trim())
    return res.status(400).json({ error: "name required" });
  if (name.trim().length > 24)
    return res.status(400).json({ error: "Deck name must be 24 characters or fewer" });

  try {
    const db   = await getDb();
    const coll = await db.collection("collectionsv2").findOne({ ownerId });
    if (!coll) return res.status(404).json({ error: "Collection not found" });

    const allCards = await db.collection("cardsv2")
      .find({ id: { $in: coll.active }, deleted: { $ne: true } })
      .toArray();
    const activeCards = coll.active.map(id => allCards.find(c => c.id === id)).filter(Boolean);
    const legality    = checkActiveLegality(activeCards);
    if (!legality.ok) return res.status(400).json({ error: `Cannot save: ${legality.reason}` });

    const savedDecks = coll.savedDecks || [];
    if (overwriteId) {
      const idx = savedDecks.findIndex(d => d.id === overwriteId);
      if (idx === -1) return res.status(404).json({ error: "Deck not found" });
      savedDecks[idx] = { ...savedDecks[idx], name: name.trim(), cards: [...coll.active] };
    } else {
      if (savedDecks.length >= _SAVED_DECKS_MAX)
        return res.status(400).json({ error: `Already have ${_SAVED_DECKS_MAX} saved decks` });
      savedDecks.push({ id: crypto.randomUUID(), name: name.trim(), cards: [...coll.active] });
    }

    await db.collection("collectionsv2").updateOne({ ownerId }, { $set: { savedDecks } });
    return res.status(200).json({ ok: true, savedDecks });
  } catch (err) {
    console.error("saveDeck error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// ── DELETE /api2/cards/:cardId ────────────────────────────────────────────────
async function deleteCard(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  let player;
  try {
    player = await requirePlayer(req);
  } catch (e) {
    if (e.status && e.body) return res.status(e.status).json(e.body);
    throw e;
  }
  const ownerId = player.id;

  const { cardId } = req.params;
  const { replacementId } = req.body || {};
  if (!cardId)
    return res.status(400).json({ error: "cardId required" });

  try {
    const db   = await getDb();
    const coll = await db.collection("collectionsv2").findOne({ ownerId });
    if (!coll) return res.status(404).json({ error: "Collection not found" });

    // Cooldown check
    if (coll.lastDeletedAt) {
      const elapsed = Date.now() - coll.lastDeletedAt;
      if (elapsed < _DELETE_COOLDOWN_MS) {
        const remaining = _DELETE_COOLDOWN_MS - elapsed;
        const m = Math.floor(remaining / 60000);
        const s = Math.ceil((remaining % 60000) / 1000);
        return res.status(429).json({
          error: `You can delete again in ${m}:${String(s).padStart(2,"0")}`,
          cooldownRemainingMs: remaining,
        });
      }
    }

    const isActive   = coll.active.includes(cardId);
    const isInactive = coll.inactive.includes(cardId);
    if (!isActive && !isInactive)
      return res.status(404).json({ error: "Card not found in collection" });

    let newActive   = [...coll.active];
    let newInactive = [...coll.inactive];
    let unplayable  = false;

    if (isActive) {
      newActive = newActive.filter(id => id !== cardId);
      if (replacementId) {
        if (!coll.inactive.includes(replacementId))
          return res.status(400).json({ error: "Replacement card not in inactive" });
        // Legality check with replacement
        const allCards = await db.collection("cardsv2")
          .find({ id: { $in: [...newActive, replacementId] }, deleted: { $ne: true } })
          .toArray();
        const proposed = [...newActive, replacementId].map(id => allCards.find(c => c.id === id)).filter(Boolean);
        const legality = checkActiveLegality(proposed);
        if (!legality.ok)
          return res.status(400).json({ error: `Replacement would make deck illegal: ${legality.reason}` });
        newActive   = [...newActive, replacementId];
        newInactive = newInactive.filter(id => id !== replacementId);
      } else {
        unplayable = true;
      }
    } else {
      newInactive = newInactive.filter(id => id !== cardId);
    }

    // Mark any saved decks that referenced this card
    const savedDecks = (coll.savedDecks || []).map(d => ({
      ...d,
      needsCard: d.cards.includes(cardId) ? cardId : (d.needsCard || null),
    }));

    // Soft-delete: mark card as deleted, keep fingerprint for duplicate check
    await db.collection("cardsv2").updateOne({ id: cardId }, { $set: { deleted: true, deletedAt: new Date() } });
    await db.collection("collectionsv2").updateOne(
      { ownerId },
      { $set: { active: newActive, inactive: newInactive, savedDecks, lastDeletedAt: Date.now() } }
    );

    return res.status(200).json({ ok: true, unplayable: unplayable || false });
  } catch (err) {
    console.error("deleteCard error:", err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { getCollectionState, swapCards, saveDeck, deleteCard };
