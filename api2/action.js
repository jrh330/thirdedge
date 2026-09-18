"use strict";

const { getDb } = require("./_db");
const { requirePlayer } = require("../auth/player");
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
    // ── Auth ──────────────────────────────────────────────────────────────────
    let player;
    try {
      player = await requirePlayer(req);
    } catch (e) {
      if (e.status && e.body) return res.status(e.status).json(e.body);
      throw e;
    }

    const { code, playerId, action, cardId, category, giveCardId, swapIndex } = req.body;

    if (!code || !playerId || !action) {
      return res.status(400).json({ error: "Missing required fields: code, playerId, action" });
    }

    const db = await getDb();
    const games = db.collection("gamesv2");
    const game = await games.findOne({ code: code.toUpperCase() });
    if (!game) return res.status(404).json({ error: "Game not found" });

    // Verify the authenticated player is a participant in this game
    const gamePlayerIds = [game.p1?.id, game.p2?.id].filter(Boolean);
    if (!gamePlayerIds.includes(player.id)) {
      return res.status(403).json({ error: "You are not a player in this game" });
    }
    // Verify the submitted playerId is one of the seats in this game
    if (!gamePlayerIds.includes(playerId)) {
      return res.status(403).json({ error: "Invalid playerId for this game" });
    }

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
