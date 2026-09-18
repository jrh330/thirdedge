"use strict";

const { getDb }        = require("./_db");
const { requirePlayer } = require("../auth/player");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  // ── Auth ────────────────────────────────────────────────────────────────────
  let player;
  try {
    player = await requirePlayer(req);
  } catch (e) {
    if (e.status && e.body) return res.status(e.status).json(e.body);
    throw e;
  }

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
      const ms    = game.matchState;
      const round = ms.rounds[ms.rounds.length - 1];

      // Hand visibility:
      // - Hot-seat (both seats are the same player): send full hands for both
      // - Two-machine: send full hand only for the requesting player's seat;
      //   opponent gets an empty array (client only uses handCount for them)
      const p1Id    = game.p1?.id;
      const p2Id    = game.p2?.id;
      const hotSeat = p1Id && p2Id && p1Id === p2Id;

      const canSeeHand = (slotPlayerId) =>
        hotSeat || player.id === slotPlayerId;

      const roundView = {
        index:  round.index,
        stake:  round.stake,
        phase:  round.phase,
        history: round.history,
        lastResult:     round.phase === "reveal" ? (round.lastResult     || null) : null,
        lastPlayed:     round.phase === "reveal" ? (round.lastPlayed     || null) : null,
        lastCategories: round.phase === "reveal" ? (round.lastCategories || null) : null,
        players: round.players.map(p => ({
          playerId:  p.playerId,
          handCount: p.hand.length,
          hand:      canSeeHand(p.playerId) ? p.hand : [],
          anchor:    p.anchor,
          discard:   p.discard,
          points:    p.points,
          drawCount: p.draw.length,
        })),
        // NOTE: round.pending is intentionally excluded
      };

      response.matchState = {
        roundsWon:    ms.roundsWon,
        winnerId:     ms.winnerId,
        pendingTrade: ms.pendingTrade ? { winner: ms.pendingTrade.winner, loser: ms.pendingTrade.loser } : null,
        round:        roundView,
        cards:        ms.cards,
      };
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error("api2/poll error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
