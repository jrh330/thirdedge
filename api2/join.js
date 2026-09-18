"use strict";

const { getDb } = require("./_db");
const { PRESETS } = require("./_decks");
const { BY_ID } = require("../engine2/fixtures");
const { createMatch } = require("../engine2/match");
const { RULE_SET } = require("../engine2/constants");
const { validateDeck } = require("../engine2/validate");
const { requirePlayer } = require("../auth/player");

const PRESET_NAMES = new Set(PRESETS.map(p => p.name));
const PRESET_BY_NAME = Object.fromEntries(PRESETS.map(p => [p.name, p]));

// Resolve a player's active minted collection into a deck array
async function resolvePlayerCollection(playerId, db) {
  const coll = await db.collection("collectionsv2").findOne({ ownerId: playerId });
  if (!coll || !coll.active?.length) {
    throw new Error("You don't have an active collection yet. Mint some cards first.");
  }

  const cards = await db.collection("cardsv2")
    .find({ id: { $in: coll.active }, deleted: { $ne: true } })
    .toArray();
  const byId = Object.fromEntries(cards.map(c => [c.id, c]));

  const resolved = coll.active.map(id => {
    const card = byId[id];
    if (!card) throw new Error(`Active card not found: ${id}`);
    return card;
  });

  const v = validateDeck(resolved, RULE_SET.FAMILY_WHEEL);
  if (!v.ok) {
    throw new Error(`Your collection isn't a legal deck yet: ${v.errors.join("; ")}`);
  }

  return resolved;
}

// Resolve a deck reference (deckName or deckId) to an array of card objects.
// If neither is provided, falls back to the player's active collection.
async function resolveDeck(deckName, deckId, playerId, db) {
  if (deckName) {
    const preset = PRESET_BY_NAME[deckName];
    if (!preset) throw new Error(`Unknown preset deck: ${deckName}`);
    return preset.cards.map(id => {
      const card = BY_ID[id];
      if (!card) throw new Error(`Unknown preset card id: ${id}`);
      return card;
    });
  }
  if (deckId) {
    const deck = await db.collection("decksv2").findOne({ id: deckId });
    if (!deck) throw new Error(`Custom deck not found: ${deckId}`);
    const cards = await db.collection("cardsv2")
      .find({ id: { $in: deck.cardIds } })
      .toArray();
    const byId = Object.fromEntries(cards.map(c => [c.id, c]));
    return deck.cardIds.map(id => {
      if (!byId[id]) throw new Error(`Card not found: ${id}`);
      return byId[id];
    });
  }
  // No deck specified — use the player's active minted collection
  return resolvePlayerCollection(playerId, db);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  let player;
  try {
    player = await requirePlayer(req);
  } catch (e) {
    if (e.status && e.body) return res.status(e.status).json(e.body);
    throw e;
  }

  try {
    const { code, p2DeckName, p2DeckId } = req.body;
    const p2Name = player.name;

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "code required" });
    }
    if (p2DeckName && !PRESET_NAMES.has(p2DeckName)) {
      return res.status(400).json({ error: `p2DeckName must be one of: ${[...PRESET_NAMES].join(", ")}` });
    }

    const db = await getDb();
    const games = db.collection("gamesv2");
    const game = await games.findOne({ code: code.toUpperCase(), status: "waiting" });

    if (!game) {
      return res.status(404).json({ error: "Room not found or already full" });
    }

    const p1Id = game.p1.id;
    const p2Id = player.id;

    const [deckA, deckB] = await Promise.all([
      resolveDeck(game.p1.deckName, game.p1.deckId, p1Id, db),
      resolveDeck(p2DeckName, p2DeckId, p2Id, db),
    ]);

    const matchState = createMatch(game.code, p1Id, deckA, p2Id, deckB, RULE_SET.FAMILY_WHEEL);

    await games.updateOne(
      { _id: game._id },
      {
        $set: {
          p2: { id: p2Id, name: p2Name, ...(p2DeckId ? { deckId: p2DeckId } : p2DeckName ? { deckName: p2DeckName } : {}) },
          matchState,
          status: "playing",
          updatedAt: new Date(),
        },
      }
    );

    return res.status(200).json({ code: game.code, playerId: p2Id, p1Id, p2Id });
  } catch (err) {
    console.error("api2/join error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
