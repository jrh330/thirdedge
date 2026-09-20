"use strict";

const crypto = require('crypto');
const { getDb } = require("./_db");
const { requirePlayer } = require("../auth/player");
const { ACTIVE_SIZE, FAMILY_MAX, SEVEN_ALLOWANCE } = require("../engine2/constants");
const { logEvent } = require('./_events');

// The 30-card test pool (from card-game/design/test-pool.json)
const TEST_POOL = [
  { id: "peregrine-falcon", name: "Peregrine Falcon", kind: "Raptor",        family: "Vita",  power: 1, speed: 7, wits: 4, carriesSeven: true  },
  { id: "wise-elder",       name: "Wise Elder",       kind: "Mentor",        family: "Vita",  power: 2, speed: 3, wits: 7, carriesSeven: true  },
  { id: "sleep",            name: "Sleep",            kind: "State",         family: "Vita",  power: 5, speed: 1, wits: 6, carriesSeven: false },
  { id: "babe-ruth",        name: "Babe Ruth",        kind: "Ballplayer",    family: "Vita",  power: 6, speed: 2, wits: 4, carriesSeven: false },
  { id: "nosebleed",        name: "Nosebleed",        kind: "Ailment",       family: "Vita",  power: 4, speed: 6, wits: 2, carriesSeven: false },
  { id: "dizziness",        name: "Dizziness",        kind: "State",         family: "Vita",  power: 3, speed: 6, wits: 3, carriesSeven: false },
  { id: "failure",          name: "Failure",          kind: "Experience",    family: "Vita",  power: 5, speed: 2, wits: 5, carriesSeven: false },
  { id: "grapes",           name: "Grapes",           kind: "Fruit",         family: "Vita",  power: 2, speed: 5, wits: 5, carriesSeven: false },
  { id: "honey-badger",     name: "Honey Badger",     kind: "Mammal",        family: "Vita",  power: 5, speed: 4, wits: 3, carriesSeven: false },
  { id: "alley-cat",        name: "Alley Cat",        kind: "Feline",        family: "Vita",  power: 4, speed: 4, wits: 4, carriesSeven: false },
  { id: "glacier",          name: "Glacier",          kind: "Ice Formation", family: "Terra", power: 7, speed: 1, wits: 4, carriesSeven: true  },
  { id: "lightning-bolt",   name: "Lightning Bolt",   kind: "Phenomenon",    family: "Terra", power: 3, speed: 7, wits: 2, carriesSeven: true  },
  { id: "quicksand",        name: "Quicksand",        kind: "Hazard",        family: "Terra", power: 6, speed: 1, wits: 5, carriesSeven: false },
  { id: "sandstorm",        name: "Sandstorm",        kind: "Weather",       family: "Terra", power: 5, speed: 6, wits: 1, carriesSeven: false },
  { id: "fog",              name: "Fog",              kind: "Weather",       family: "Terra", power: 2, speed: 4, wits: 6, carriesSeven: false },
  { id: "jet-stream",       name: "Jet Stream",       kind: "Air Current",   family: "Terra", power: 3, speed: 6, wits: 3, carriesSeven: false },
  { id: "amber",            name: "Amber",            kind: "Mineral",       family: "Terra", power: 5, speed: 2, wits: 5, carriesSeven: false },
  { id: "sweden",           name: "Sweden",           kind: "Nation",        family: "Terra", power: 4, speed: 3, wits: 5, carriesSeven: false },
  { id: "obsidian",         name: "Obsidian",         kind: "Rock",          family: "Terra", power: 5, speed: 4, wits: 3, carriesSeven: false },
  { id: "gravel",           name: "Gravel",           kind: "Material",      family: "Terra", power: 4, speed: 4, wits: 4, carriesSeven: false },
  { id: "chess",            name: "Chess",            kind: "Game",          family: "Arte",  power: 1, speed: 4, wits: 7, carriesSeven: true  },
  { id: "wrecking-ball",    name: "Wrecking Ball",    kind: "Tool",          family: "Arte",  power: 7, speed: 3, wits: 2, carriesSeven: true  },
  { id: "chainsaw",         name: "Chainsaw",         kind: "Tool",          family: "Arte",  power: 5, speed: 6, wits: 1, carriesSeven: false },
  { id: "tax-code",         name: "Tax Code",         kind: "Document",      family: "Arte",  power: 4, speed: 2, wits: 6, carriesSeven: false },
  { id: "kraken",           name: "Kraken",           kind: "Sea Monster",   family: "Arte",  power: 6, speed: 3, wits: 3, carriesSeven: false },
  { id: "vaccine",          name: "Vaccine",          kind: "Medicine",      family: "Arte",  power: 3, speed: 3, wits: 6, carriesSeven: false },
  { id: "heart-surgery",    name: "Heart Surgery",    kind: "Procedure",     family: "Arte",  power: 5, speed: 2, wits: 5, carriesSeven: false },
  { id: "strip-club",       name: "Strip Club",       kind: "Venue",         family: "Arte",  power: 3, speed: 4, wits: 5, carriesSeven: false },
  { id: "swiss-army-knife", name: "Swiss Army Knife", kind: "Tool",          family: "Arte",  power: 4, speed: 4, wits: 4, carriesSeven: false },
  { id: "vending-machine",  name: "Vending Machine",  kind: "Device",        family: "Arte",  power: 4, speed: 4, wits: 4, carriesSeven: false },
];

// Seeded-ish shuffle so the same player gets different cards on repeated fills
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick test cards to fill `needed` more active slots, respecting current counts.
function pickCards(needed, famCount, sevenCount, alreadyUsedIds) {
  const usedSet   = new Set(alreadyUsedIds);
  const available = TEST_POOL.filter(c => !usedSet.has(c.id));
  const nonSevens = shuffle(available.filter(c => !c.carriesSeven));
  const sevens    = shuffle(available.filter(c =>  c.carriesSeven));

  const picked  = [];
  const fc      = { ...famCount };
  let   sc      = sevenCount;

  const sevenTarget = Math.min(SEVEN_ALLOWANCE - sc, Math.ceil(needed / 4));

  for (const card of nonSevens) {
    if (picked.length >= needed - sevenTarget) break;
    if ((fc[card.family] || 0) < FAMILY_MAX) {
      picked.push(card);
      fc[card.family] = (fc[card.family] || 0) + 1;
    }
  }

  for (const card of sevens) {
    if (picked.length >= needed) break;
    if (sc >= SEVEN_ALLOWANCE) break;
    if ((fc[card.family] || 0) < FAMILY_MAX) {
      picked.push(card);
      fc[card.family] = (fc[card.family] || 0) + 1;
      sc++;
    }
  }

  if (picked.length < needed) {
    for (const card of [...nonSevens, ...sevens]) {
      if (picked.length >= needed) break;
      if (picked.find(p => p.id === card.id)) continue;
      if ((fc[card.family] || 0) < FAMILY_MAX) {
        picked.push(card);
        fc[card.family] = (fc[card.family] || 0) + 1;
        if (card.carriesSeven) sc++;
      }
    }
  }

  return picked;
}

// ── giveSampleDeck ────────────────────────────────────────────────────────────
/**
 * Give a player 12 sample cards (filling active slots to ACTIVE_SIZE).
 * Called directly — not via HTTP — so invite creation and admin actions
 * can reuse this without a network round-trip.
 *
 * Cards are marked isTestCard: true AND source: "sample".
 * source: "sample" lets analytics exclude them from minting statistics;
 * isTestCard: true is the existing field used by collection queries.
 *
 * Returns { added: N, total: N } or throws on DB error.
 *
 * @param {string} playerId
 * @param {import('mongodb').Db} db
 */
async function giveSampleDeck(playerId, db) {
  const cardsCol = db.collection("cardsv2");
  const collCol  = db.collection("collectionsv2");

  const allCards = await cardsCol.find({ ownerId: playerId, deleted: { $ne: true } }).toArray();
  let collDoc    = await collCol.findOne({ ownerId: playerId });

  if (!collDoc) {
    const ids = allCards.map(c => c.id);
    collDoc   = { ownerId: playerId, active: ids.slice(0, ACTIVE_SIZE), inactive: ids.slice(ACTIVE_SIZE), savedDecks: [], lastDeletedAt: null };
    await collCol.insertOne(collDoc);
  }

  const byId        = Object.fromEntries(allCards.map(c => [c.id, c]));
  const activeCards = collDoc.active.map(id => byId[id]).filter(Boolean);
  const needed      = ACTIVE_SIZE - activeCards.length;

  if (needed <= 0) return { added: 0, total: collDoc.active.length };

  const alreadyTestIds = allCards.filter(c => c.isTestCard).map(c => c.testPoolId);

  const famCount = {};
  let sevenCount = 0;
  for (const c of activeCards) {
    famCount[c.family] = (famCount[c.family] || 0) + 1;
    if (c.carriesSeven) sevenCount++;
  }

  const toAdd = pickCards(needed, famCount, sevenCount, alreadyTestIds);
  if (toAdd.length === 0) return { added: 0, total: collDoc.active.length };

  const now     = new Date();
  const newDocs = toAdd.map(card => ({
    id:           `${playerId}-test-${card.id}`,
    testPoolId:   card.id,
    isTestCard:   true,
    source:       'sample',        // analytics marker — excluded from minting stats
    ownerId:      playerId,
    name:         card.name,
    kind:         card.kind,
    family:       card.family,
    power:        card.power,
    speed:        card.speed,
    wits:         card.wits,
    carriesSeven: card.carriesSeven,
    imageUrl:     null,
    mintedAt:     now,
  }));

  await cardsCol.insertMany(newDocs, { ordered: false }).catch(err => {
    if (err.code !== 11000) throw err; // ignore duplicate key (idempotent)
  });

  const newIds        = newDocs.map(d => d.id);
  const updatedActive = [...collDoc.active, ...newIds];

  await collCol.updateOne(
    { ownerId: playerId },
    { $set: { active: updatedActive, updatedAt: now } }
  );

  if (newDocs.length > 0) {
    logEvent(playerId, 'samples_given', { count: newDocs.length });
  }

  return { added: newDocs.length, total: updatedActive.length };
}

// ── Admin auth helper (mirrors admin-invites.js) ──────────────────────────────

function isAdminRequest(req) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const provided = req.headers['x-admin-secret'] || '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

// ── POST /api2/collection/fill-test ──────────────────────────────────────────
// Restricted to admin callers OR players with 0 cards.
// (Testers with a full sample deck don't need this; admins can override.)

async function fill(req, res) {
  let player;
  try { player = await requirePlayer(req); }
  catch (e) { if (e.status && e.body) return res.status(e.status).json(e.body); throw e; }

  const adminCaller = isAdminRequest(req);

  try {
    const db       = await getDb();
    const cardsCol = db.collection("cardsv2");

    if (!adminCaller) {
      const cardCount = await cardsCol.countDocuments({ ownerId: player.id, deleted: { $ne: true } });
      if (cardCount > 0) {
        return res.status(403).json({ error: "Sample cards can only be added when your collection is empty. Ask your session host to reset your cards." });
      }
    }

    const result = await giveSampleDeck(player.id, db);

    if (result.added === 0) {
      return res.status(400).json({ error: "Active deck is already full or no suitable sample cards available." });
    }

    return res.status(200).json({ added: result.added, total: result.total });
  } catch (err) {
    console.error("fill-test error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ── DELETE /api2/collection/fill-test ────────────────────────────────────────

async function remove(req, res) {
  let player;
  try { player = await requirePlayer(req); }
  catch (e) { if (e.status && e.body) return res.status(e.status).json(e.body); throw e; }

  try {
    const db       = await getDb();
    const cardsCol = db.collection("cardsv2");
    const collCol  = db.collection("collectionsv2");

    const testCards = await cardsCol.find({ ownerId: player.id, isTestCard: true }).toArray();
    const testIds   = new Set(testCards.map(c => c.id));

    if (testIds.size > 0) {
      await cardsCol.deleteMany({ ownerId: player.id, isTestCard: true });
    }

    const collDoc = await collCol.findOne({ ownerId: player.id });
    if (collDoc) {
      const active   = (collDoc.active   || []).filter(id => !testIds.has(id));
      const inactive = (collDoc.inactive || []).filter(id => !testIds.has(id));
      await collCol.updateOne({ ownerId: player.id }, { $set: { active, inactive, updatedAt: new Date() } });
    }

    return res.status(200).json({ removed: testIds.size });
  } catch (err) {
    console.error("fill-test remove error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ── POST /api2/collection/clear-samples ──────────────────────────────────────
// Deletes only sample cards (isTestCard: true), no cooldown.
// Lets a tester start fresh with their own minted cards.

async function clearSamples(req, res) {
  let player;
  try { player = await requirePlayer(req); }
  catch (e) { if (e.status && e.body) return res.status(e.status).json(e.body); throw e; }

  try {
    const db       = await getDb();
    const cardsCol = db.collection("cardsv2");
    const collCol  = db.collection("collectionsv2");

    const samples = await cardsCol
      .find({ ownerId: player.id, isTestCard: true })
      .project({ id: 1, _id: 0 })
      .toArray();
    const sampleIds = new Set(samples.map(c => c.id));

    if (sampleIds.size > 0) {
      await cardsCol.deleteMany({ ownerId: player.id, isTestCard: true });
    }

    const collDoc = await collCol.findOne({ ownerId: player.id });
    if (collDoc) {
      const active   = (collDoc.active   || []).filter(id => !sampleIds.has(id));
      const inactive = (collDoc.inactive || []).filter(id => !sampleIds.has(id));
      await collCol.updateOne(
        { ownerId: player.id },
        { $set: { active, inactive, updatedAt: new Date() } }
      );
    }

    return res.status(200).json({ removed: sampleIds.size });
  } catch (err) {
    console.error("clearSamples error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

module.exports = { fill, remove, clearSamples, giveSampleDeck };
