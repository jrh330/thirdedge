const { getDb } = require("./_db");

const VALID_FONTS = ["outfit", "orbitron", "pacifico", "bebas", "playfair"];

async function getCards(req, res) {
  const { playerId } = req.query;
  if (!playerId) return res.status(400).json({ error: "playerId required" });
  const db = await getDb();
  const cards = await db.collection("custom_cards")
    .find({ playerId }, { projection: { _id: 0 } })
    .sort({ createdAt: 1 })
    .toArray();
  return res.json({ cards });
}

async function createCard(req, res) {
  const { playerId, name, font, imageUrl, attrs, imgScale, imgX, imgY } = req.body;

  if (!playerId || !name || !font || !Array.isArray(attrs))
    return res.status(400).json({ error: "Missing required fields" });

  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 20)
    return res.status(400).json({ error: "Name must be 1-20 characters" });

  if (!VALID_FONTS.includes(font))
    return res.status(400).json({ error: "Invalid font" });

  if (
    attrs.length !== 3 ||
    attrs.reduce((a, b) => a + b, 0) !== 27 ||
    !attrs.every(v => Number.isInteger(v) && v >= 3 && v <= 21 && v % 3 === 0)
  ) return res.status(400).json({ error: "Attributes must be multiples of 3 summing to 27" });

  if (attrs[0] === attrs[1] && attrs[1] === attrs[2])
    return res.status(400).json({ error: "All three attributes can't be equal — add some variety!" });

  const db = await getDb();
  const count = await db.collection("custom_cards").countDocuments({ playerId });
  if (count >= 7) return res.status(400).json({ error: "Maximum 7 custom cards reached" });

  const card = {
    id: `cc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    playerId,
    name: trimmed,
    font,
    imageUrl: imageUrl || null,
    imgScale: imgScale || 1,
    imgX: imgX || 50,
    imgY: imgY || 50,
    attrs,
    createdAt: new Date(),
  };

  await db.collection("custom_cards").insertOne(card);
  return res.json({ card });
}

async function deleteCard(req, res) {
  const { playerId } = req.body;
  const { cardId } = req.params;
  if (!playerId || !cardId) return res.status(400).json({ error: "Missing fields" });
  const db = await getDb();
  const result = await db.collection("custom_cards").deleteOne({ id: cardId, playerId });
  if (result.deletedCount === 0) return res.status(404).json({ error: "Card not found" });
  return res.json({ ok: true });
}

module.exports = { getCards, createCard, deleteCard };
