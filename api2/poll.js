"use strict";

const { getDb } = require("./_db");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: "code required" });
    }

    const db = await getDb();
    const game = await db.collection("gamesv2").findOne({ code: code.toUpperCase() });
    if (!game) return res.status(404).json({ error: "Game not found" });

    const response = {
      status: game.status,
      p1: game.p1 ? { id: game.p1.id, name: game.p1.name, deckName: game.p1.deckName } : null,
      p2: game.p2 ? { id: game.p2.id, name: game.p2.name, deckName: game.p2.deckName } : null,
      matchState: null,
    };

    if (game.matchState) {
      const ms = game.matchState;
      const round = ms.rounds[ms.rounds.length - 1];

      // Build round view — hot-seat: show full hands for both players
      const roundView = {
        index: round.index,
        stake: round.stake,
        phase: round.phase,
        history: round.history,
        // Reveal phase fields — only include if currently in reveal phase
        lastResult:     round.phase === "reveal" ? (round.lastResult     || null) : null,
        lastPlayed:     round.phase === "reveal" ? (round.lastPlayed     || null) : null,
        lastCategories: round.phase === "reveal" ? (round.lastCategories || null) : null,
        players: round.players.map(p => ({
          playerId:  p.playerId,
          handCount: p.hand.length,
          hand:      p.hand,          // full hand for hot-seat
          anchor:    p.anchor,
          discard:   p.discard,
          points:    p.points,
          drawCount: p.draw.length,
        })),
        // NOTE: round.pending is intentionally excluded
      };

      response.matchState = {
        roundsWon:   ms.roundsWon,
        winnerId:    ms.winnerId,
        pendingTrade: ms.pendingTrade ? { winner: ms.pendingTrade.winner, loser: ms.pendingTrade.loser } : null,
        round:       roundView,
        cards:       ms.cards,
      };
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error("api2/poll error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
