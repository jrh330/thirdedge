"use strict";

const { getDb } = require("./_db");
const { genRoomCode } = require("./_utils");
const { PRESETS } = require("./_decks");

const PRESET_NAMES = new Set(PRESETS.map(p => p.name));

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { p1Name, p1DeckName, p1DeckId } = req.body;

    if (!p1Name || typeof p1Name !== "string") {
      return res.status(400).json({ error: "p1Name required" });
    }

    let p1DeckRef;
    if (p1DeckId) {
      // Custom deck — verify it exists
      const db0 = await getDb();
      const deck = await db0.collection("decksv2").findOne({ id: p1DeckId });
      if (!deck) return res.status(400).json({ error: "Custom deck not found" });
      p1DeckRef = { deckId: p1DeckId };
    } else if (p1DeckName) {
      if (!PRESET_NAMES.has(p1DeckName))
        return res.status(400).json({ error: `p1DeckName must be one of: ${[...PRESET_NAMES].join(", ")}` });
      p1DeckRef = { deckName: p1DeckName };
    } else {
      return res.status(400).json({ error: "p1DeckName or p1DeckId required" });
    }

    const db = await getDb();
    const games = db.collection("gamesv2");

    // Generate unique room code
    let code;
    let attempts = 0;
    do {
      code = genRoomCode();
      const exists = await games.findOne({ code, status: { $ne: "complete" } });
      if (!exists) break;
      attempts++;
    } while (attempts < 20);

    if (attempts >= 20) {
      return res.status(500).json({ error: "Could not generate room code" });
    }

    const p1Id = crypto.randomUUID();

    const doc = {
      code,
      status: "waiting",
      p1: { id: p1Id, name: p1Name, ...p1DeckRef },
      p2: null,
      matchState: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await games.insertOne(doc);

    return res.status(200).json({ code, playerId: p1Id });
  } catch (err) {
    console.error("api2/create error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
