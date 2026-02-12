const { getDb } = require("./_db");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { code } = req.body;
    if (!code || typeof code !== "string") return res.status(400).json({ error: "Room code required" });

    const db = await getDb();
    const games = db.collection("games");
    const game = await games.findOne({ code: code.toUpperCase(), status: "waiting" });

    if (!game) return res.status(404).json({ error: "Room not found or already full" });

    const playerId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await games.updateOne(
      { _id: game._id },
      {
        $set: {
          p2: { id: playerId, name: "Player 2" },
          status: "roster",
          updatedAt: new Date(),
        },
      }
    );

    return res.status(200).json({
      code: game.code,
      playerId,
      playerNum: 2,
    });
  } catch (err) {
    console.error("join error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
