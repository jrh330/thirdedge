"use strict";

const { getDb } = require("./_db");
const { validateDeck } = require("../engine2/validate");
const { RULE_SET } = require("../engine2/constants");

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function getDecks(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { owner } = req.query;
    if (!owner?.trim()) return res.status(400).json({ error: "owner required" });

    const db = await getDb();
    const decks = await db.collection("decksv2")
      .find({ ownerName: owner.trim() })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({ decks });
  } catch (err) {
    console.error("api2/decks GET error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

async function saveDeck(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { ownerName, name, cardIds } = req.body;

    if (!ownerName?.trim()) return res.status(400).json({ error: "ownerName required" });
    if (!name?.trim())       return res.status(400).json({ error: "name required" });
    if (!Array.isArray(cardIds) || cardIds.length !== 12)
      return res.status(400).json({ error: "cardIds must be an array of exactly 12 IDs" });

    const db = await getDb();
    const cards = await db.collection("cardsv2")
      .find({ id: { $in: cardIds } })
      .toArray();

    if (cards.length !== 12)
      return res.status(400).json({ error: `Only ${cards.length} of 12 card IDs were found` });

    const result = validateDeck(cards, RULE_SET.FAMILY_WHEEL);
    if (!result.ok)
      return res.status(400).json({ error: result.errors.join("; ") });

    // Preserve the user's ordering
    const byId = Object.fromEntries(cards.map(c => [c.id, c]));
    const orderedCards = cardIds.map(id => byId[id]);

    const deck = {
      id: crypto.randomUUID(),
      ownerName: ownerName.trim(),
      name: name.trim(),
      cardIds,
      // Snapshot of card names for display without extra lookups
      cardNames: orderedCards.map(c => c.name),
      createdAt: new Date(),
    };

    await db.collection("decksv2").insertOne(deck);
    return res.status(200).json({ ok: true, deck });
  } catch (err) {
    console.error("api2/decks POST error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

module.exports = { getDecks, saveDeck };
