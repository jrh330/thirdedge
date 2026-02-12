const { getDb } = require("./_db");
const { genRoomCode, genSeq } = require("./_game");

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

    const game = {
      code,
      status: "waiting", // waiting → roster → hand → playing → match_end → series_end
      createdAt: new Date(),
      updatedAt: new Date(),

      // Players
      p1: { id: playerId, name: "Player 1" },
      p2: null,

      // Series
      seriesScore: [0, 0],
      matchNum: 1,

      // Current match
      match: {
        // Attribute sequence - generated when match starts (hand confirm)
        seq: null,
        round: 0,
        score: [0, 0],
        carry: 0,
        history: [],

        // Roster phase
        p1Roster: null,
        p2Roster: null,

        // Hand phase
        p1Hand: null,
        p2Hand: null,

        // Current round plays
        p1Play: null,
        p2Play: null,
      },
    };

    await games.insertOne(game);

    return res.status(200).json({
      code,
      playerId,
      playerNum: 1,
    });
  } catch (err) {
    console.error("create error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
