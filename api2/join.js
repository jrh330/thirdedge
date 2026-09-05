"use strict";

const { getDb } = require("./_db");
const { PRESETS } = require("./_decks");
const { BY_ID } = require("../engine2/fixtures");
const { createMatch } = require("../engine2/match");
const { RULE_SET } = require("../engine2/constants");

const PRESET_NAMES = new Set(PRESETS.map(p => p.name));
const PRESET_BY_NAME = Object.fromEntries(PRESETS.map(p => [p.name, p]));

// Resolve a deck reference (deckName or deckId) to an array of card objects
async function resolveDeck(deckName, deckId, db) {
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
  throw new Error("deckName or deckId required");
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { code, p2Name, p2DeckName, p2DeckId } = req.body;

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "code required" });
    }
    if (!p2Name || typeof p2Name !== "string") {
      return res.status(400).json({ error: "p2Name required" });
    }
    if (!p2DeckName && !p2DeckId) {
      return res.status(400).json({ error: "p2DeckName or p2DeckId required" });
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
    const p2Id = crypto.randomUUID();

    const [deckA, deckB] = await Promise.all([
      resolveDeck(game.p1.deckName, game.p1.deckId, db),
      resolveDeck(p2DeckName, p2DeckId, db),
    ]);

    const matchState = createMatch(game.code, p1Id, deckA, p2Id, deckB, RULE_SET.FAMILY_WHEEL);

    await games.updateOne(
      { _id: game._id },
      {
        $set: {
          p2: { id: p2Id, name: p2Name, ...(p2DeckId ? { deckId: p2DeckId } : { deckName: p2DeckName }) },
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
