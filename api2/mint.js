"use strict";

const { getDb } = require("./_db");
const Anthropic = require("@anthropic-ai/sdk");
const { validateCard } = require("../engine2/validate");
const { RULE_SET, TRAITS, FAMILY_OF } = require("../engine2/constants");

// Client is created per-request so Railway env vars are always current
function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  return new Anthropic({ apiKey });
}

const LEGAL_SHAPES = [[7,4,1],[7,3,2],[6,5,1],[6,4,2],[6,3,3],[5,5,2],[5,4,3],[4,4,4]];

const SYSTEM_PROMPT = `You are a stat designer for a card game called Third Edge.

Each card has three stats — Power, Speed, and Wits — that must follow these rules:
1. The three stats must sum to exactly 12.
2. Each stat must be between 1 and 7 inclusive.
3. The combination must be one of these 8 legal shapes (any order):
   7/4/1 · 7/3/2 · 6/5/1 · 6/4/2 · 6/3/3 · 5/5/2 · 5/4/3 · 4/4/4

Stat meanings:
- Power: physical strength, force, size, raw destructive capability
- Speed: quickness, agility, reaction time, swiftness
- Wits: intelligence, cunning, strategy, adaptability, perception

The six Traits and their families:
- Beast (Living): animals, creatures of nature
- Titan (Living): giants, monsters, mythic beings
- Machine (Made): vehicles, tools, engineered objects
- Icon (Made): legendary humans, cultural figures
- Element (Raw): forces of nature, raw materials
- Spirit (Raw): supernatural, abstract, otherworldly

Given a card name, trait, optional image, and description, choose the stat shape that best
fits the card's nature. Consider: How strong is it physically? How fast? How clever?
Use the image and description as primary evidence. Look at the subject carefully.

You must respond with ONLY valid JSON in this exact format — no explanation, no markdown:
{"power": <number>, "speed": <number>, "wits": <number>, "reasoning": "<one sentence>"}`;

function pickBestShape(power, speed, wits) {
  // Find the legal shape whose sorted values best match the requested sorted values
  const sorted = [power, speed, wits].slice().sort((a, b) => b - a);
  let best = LEGAL_SHAPES[0];
  let bestDist = Infinity;
  for (const shape of LEGAL_SHAPES) {
    const dist = shape.reduce((sum, v, i) => sum + Math.abs(v - sorted[i]), 0);
    if (dist < bestDist) { bestDist = dist; best = shape; }
  }
  return best;
}

function assignStats(sortedShape, originalStats) {
  // Assign shape values back to power/speed/wits, preserving relative ordering
  const [p, s, w] = originalStats;
  const indices = [0, 1, 2].sort((a, b) => originalStats[b] - originalStats[a]);
  const result = [0, 0, 0];
  sortedShape.forEach((v, rank) => { result[indices[rank]] = v; });
  return { power: result[0], speed: result[1], wits: result[2] };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { ownerName, cardName, trait, imageUrl, description } = req.body;

    if (!ownerName?.trim()) return res.status(400).json({ error: "ownerName required" });
    if (!cardName?.trim())  return res.status(400).json({ error: "cardName required" });
    if (!TRAITS.includes(trait)) return res.status(400).json({ error: `trait must be one of: ${TRAITS.join(", ")}` });

    // Build user message for Claude
    const userContent = [];

    if (imageUrl?.trim()) {
      userContent.push({
        type: "image",
        source: { type: "url", url: imageUrl.trim() },
      });
    }

    userContent.push({
      type: "text",
      text: [
        `Card name: ${cardName.trim()}`,
        `Trait: ${trait} (${FAMILY_OF[trait]} family)`,
        description?.trim() ? `Description: ${description.trim()}` : "",
      ].filter(Boolean).join("\n"),
    });

    // Call Claude
    const message = await getClient().messages.create({
      model: "claude-opus-4-6",
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const raw = message.content[0].text.trim();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Try to extract JSON from response
      const match = raw.match(/\{[^}]+\}/);
      if (!match) throw new Error("Claude returned non-JSON response");
      parsed = JSON.parse(match[0]);
    }

    let { power, speed, wits } = parsed;
    power = Math.round(Number(power));
    speed = Math.round(Number(speed));
    wits  = Math.round(Number(wits));

    // Snap to nearest legal shape if needed
    const errors = validateCard({ power, speed, wits, trait });
    if (errors.length) {
      const shape = pickBestShape(power, speed, wits);
      const snapped = assignStats(shape, [power, speed, wits]);
      power = snapped.power; speed = snapped.speed; wits = snapped.wits;
    }

    const carriesSeven = power === 7 || speed === 7 || wits === 7;

    const card = {
      id: crypto.randomUUID(),
      name: cardName.trim(),
      trait,
      power,
      speed,
      wits,
      carriesSeven,
      imageUrl: imageUrl?.trim() || null,
      description: description?.trim() || null,
      reasoning: parsed.reasoning || null,
      ownerName: ownerName.trim(),
      mintedAt: new Date(),
    };

    const db = await getDb();
    await db.collection("cardsv2").insertOne(card);

    return res.status(200).json({ ok: true, card });
  } catch (err) {
    console.error("api2/mint error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
};
