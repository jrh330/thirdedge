"use strict";

const { getDb } = require("./_db");
const { PRESETS } = require("./_decks");
const { BY_ID } = require("../engine2/fixtures");
const { createMatch } = require("../engine2/match");
const { RULE_SET } = require("../engine2/constants");

const PRESET_NAMES = new Set(PRESETS.map(p => p.name));
const PRESET_BY_NAME = Object.fromEntries(PRESETS.map(p => [p.name, p]));

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { code, p2Name, p2DeckName } = req.body;

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "code required" });
    }
    if (!p2Name || typeof p2Name !== "string") {
      return res.status(400).json({ error: "p2Name required" });
    }
    if (!p2DeckName || !PRESET_NAMES.has(p2DeckName)) {
      return res.status(400).json({ error: `p2DeckName must be one of: ${[...PRESET_NAMES].join(", ")}` });
    }

    const db = await getDb();
    const games = db.collection("gamesv2");
    const game = await games.findOne({ code: code.toUpperCase(), status: "waiting" });

    if (!game) {
      return res.status(404).json({ error: "Room not found or already full" });
    }

    const p1Id = game.p1.id;
    const p1DeckName = game.p1.deckName;
    const p2Id = crypto.randomUUID();

    // Build card arrays from preset card ids
    const deckA = PRESET_BY_NAME[p1DeckName].cards.map(id => {
      const card = BY_ID[id];
      if (!card) throw new Error(`Unknown card id: ${id}`);
      return card;
    });
    const deckB = PRESET_BY_NAME[p2DeckName].cards.map(id => {
      const card = BY_ID[id];
      if (!card) throw new Error(`Unknown card id: ${id}`);
      return card;
    });

    const matchState = createMatch(game.code, p1Id, deckA, p2Id, deckB, RULE_SET.FAMILY_WHEEL);

    await games.updateOne(
      { _id: game._id },
      {
        $set: {
          p2: { id: p2Id, name: p2Name, deckName: p2DeckName },
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
