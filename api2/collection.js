"use strict";

const { getDb } = require("./_db");
const { requirePlayer } = require("../auth/player");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  let player;
  try {
    player = await requirePlayer(req);
  } catch (e) {
    if (e.status && e.body) return res.status(e.status).json(e.body);
    throw e;
  }

  try {
    const db = await getDb();
    const cards = await db.collection("cardsv2")
      .find({ ownerId: player.id, deleted: { $ne: true } })
      .sort({ mintedAt: -1 })
      .toArray();

    return res.status(200).json({ cards });
  } catch (err) {
    console.error("api2/collection error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
