const { getDb } = require("./_db");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { code, playerId } = req.query;
    if (!code || !playerId) return res.status(400).json({ error: "code and playerId required" });

    const db = await getDb();
    const game = await db.collection("games").findOne({ code: code.toUpperCase() });
    if (!game) return res.status(404).json({ error: "Game not found" });

    // Determine which player this is
    const playerNum = game.p1?.id === playerId ? 1 : game.p2?.id === playerId ? 2 : 0;
    if (playerNum === 0) return res.status(403).json({ error: "Not a player in this game" });

    const m = game.match;
    const opponent = playerNum === 1 ? 2 : 1;

    // Build response - only reveal what this player should see
    const state = {
      status: game.status,
      playerNum,
      seriesScore: game.seriesScore,
      matchNum: game.matchNum,
      opponentJoined: !!game.p2,
      round: m.round,
      matchScore: m.score,
      carry: m.carry,
      history: m.history,

      // Roster status
      myRosterReady: playerNum === 1 ? !!m.p1Roster : !!m.p2Roster,
      opponentRosterReady: playerNum === 1 ? !!m.p2Roster : !!m.p1Roster,

      // Hand status
      myHandReady: playerNum === 1 ? !!m.p1Hand : !!m.p2Hand,
      opponentHandReady: playerNum === 1 ? !!m.p2Hand : !!m.p1Hand,

      // My cards (private)
      myRoster: playerNum === 1 ? m.p1Roster : m.p2Roster,
      myHand: playerNum === 1 ? m.p1Hand : m.p2Hand,

      // Current round play status
      myPlayReady: playerNum === 1 ? !!m.p1Play : !!m.p2Play,
      opponentPlayReady: playerNum === 1 ? !!m.p2Play : !!m.p1Play,

      // Opponent's remaining card count (not the actual cards)
      opponentCardsLeft: (() => {
        const hand = playerNum === 1 ? m.p2Hand : m.p1Hand;
        if (!hand) return 9;
        // Count cards not yet played
        const played = new Set(m.history.map(h => playerNum === 1 ? h.p2CardId : h.p1CardId));
        return hand.length - played.size;
      })(),

      // Sequence is only revealed for completed rounds (via history)
      // Never send the full sequence to the client
    };

    return res.status(200).json(state);
  } catch (err) {
    console.error("poll error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
