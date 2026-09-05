"use strict";

const { getDb } = require("./_db");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  try {
    const { owner } = req.query;
    if (!owner?.trim()) return res.status(400).json({ error: "owner required" });

    const db = await getDb();
    const cards = await db.collection("cardsv2")
      .find({ ownerName: owner.trim() })
      .sort({ mintedAt: -1 })
      .toArray();

    return res.status(200).json({ cards });
  } catch (err) {
    console.error("api2/collection error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
