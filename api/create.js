const { getDb } = require("./_db");
const { genRoomCode, genSeq, dealRoster, botSelectHand } = require("./_game");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const db = await getDb();
    const games = db.collection("games");

    // Generate unique room code
    let code;
    let attempts = 0;
    do {
      code = genRoomCode();
      const exists = await games.findOne({ code, status: { $ne: "finished" } });
      if (!exists) break;
      attempts++;
    } while (attempts < 20);

    if (attempts >= 20) return res.status(500).json({ error: "Could not generate room code" });

    const playerId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { localPlayerId, vsBot } = req.body;

    const p2Roster = vsBot ? dealRoster() : null;

    const game = {
      code,
      status: vsBot ? "hand" : "waiting",
      createdAt: new Date(),
      updatedAt: new Date(),

      // Players
      p1: { id: playerId, name: "Player 1", localId: localPlayerId || null },
      p2: vsBot ? { id: "bot", name: "Bot", isBot: true, localId: null } : null,

      // Series
      seriesScore: [0, 0],
      matchNum: 1,

      // Current match
      match: {
        seq: null,
        round: 0,
        score: [0, 0],
        carry: 0,
        history: [],

        p1Roster: dealRoster(),
        p2Roster: p2Roster,

        p1Hand: null,
        p2Hand: vsBot ? botSelectHand(p2Roster) : null,

        p1Play: null,
        p2Play: null,
      },
    };

    await games.insertOne(game);

    return res.status(200).json({
      code,
      playerId,
      playerNum: 1,
      vsBot: !!vsBot,
    });
  } catch (err) {
    console.error("create error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
