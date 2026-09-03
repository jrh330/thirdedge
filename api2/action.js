"use strict";

const { getDb } = require("./_db");
const {
  submitPlayerMove,
  advanceMatchTurn,
  executeTrade,
  executeReclaim,
  declineTrade,
} = require("../engine2/match");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { code, playerId, action, cardId, category, giveCardId, swapIndex } = req.body;

    if (!code || !playerId || !action) {
      return res.status(400).json({ error: "Missing required fields: code, playerId, action" });
    }

    const db = await getDb();
    const games = db.collection("gamesv2");
    const game = await games.findOne({ code: code.toUpperCase() });
    if (!game) return res.status(404).json({ error: "Game not found" });

    if (!game.matchState) {
      return res.status(400).json({ error: "Match not started yet" });
    }

    let match = game.matchState;

    try {
      switch (action) {
        case "submitMove":
          match = submitPlayerMove(match, playerId, cardId, category);
          break;

        case "advanceTurn":
          match = advanceMatchTurn(match);
          break;

        case "executeTrade":
          match = executeTrade(match, playerId, giveCardId);
          break;

        case "executeReclaim":
          match = executeReclaim(match, playerId, swapIndex);
          break;

        case "declineTrade":
          match = declineTrade(match, playerId);
          break;

        default:
          return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
      }
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }

    await games.updateOne(
      { _id: game._id },
      { $set: { matchState: match, updatedAt: new Date() } }
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("api2/action error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
