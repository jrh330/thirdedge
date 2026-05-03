const { getDb } = require("./_db");
const { genSeq, dealRoster, botSelectHand, CARD_MAP } = require("./_game");

// Greedy bot: pick highest-value unplayed card for the current attribute
function botPickCard(hand, history, attr, botPNum) {
  const played = new Set(history.map(h => botPNum === 2 ? h.p2CardId : h.p1CardId));
  const available = hand.filter(id => !played.has(id));
  let best = null, bestVal = -1;
  for (const id of available) {
    const card = CARD_MAP[id];
    if (card && card.attrs[attr] > bestVal) { bestVal = card.attrs[attr]; best = id; }
  }
  return best;
}

async function resolveCard(db, cardId, localId) {
  if (CARD_MAP[cardId]) return CARD_MAP[cardId];
  if (cardId && cardId.startsWith("cc_")) {
    const c = await db.collection("custom_cards").findOne({ id: cardId, playerId: localId });
    return c || null;
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { code, playerId, action, data } = req.body;
    if (!code || !playerId || !action) return res.status(400).json({ error: "Missing fields" });

    const db = await getDb();
    const games = db.collection("games");
    const game = await games.findOne({ code: code.toUpperCase() });
    if (!game) return res.status(404).json({ error: "Game not found" });

    const pNum = game.p1?.id === playerId ? 1 : game.p2?.id === playerId ? 2 : 0;
    if (pNum === 0) return res.status(403).json({ error: "Not in this game" });

    const localId = pNum === 1 ? game.p1?.localId : game.p2?.localId;
    const m = game.match;
    const update = { updatedAt: new Date() };

    // ── HAND ──
    if (action === "hand") {
      if (game.status !== "hand") return res.status(400).json({ error: "Not in hand phase" });
      if (!Array.isArray(data) || data.length !== 9) return res.status(400).json({ error: "Need exactly 9 card IDs" });

      const standardIds = data.filter(id => !id.startsWith("cc_"));
      const customIds   = data.filter(id =>  id.startsWith("cc_"));

      if (customIds.length > 7) return res.status(400).json({ error: "Maximum 7 custom cards in hand" });

      // Validate standard cards are in roster
      const roster = pNum === 1 ? m.p1Roster : m.p2Roster;
      if (!roster) return res.status(400).json({ error: "Roster not set" });
      const rosterSet = new Set(roster);
      if (!standardIds.every(id => rosterSet.has(id)))
        return res.status(400).json({ error: "Standard cards must be from your dealt hand" });

      // Validate custom cards belong to this player
      let customCardDocs = [];
      if (customIds.length > 0) {
        if (!localId) return res.status(400).json({ error: "Player identity not linked" });
        customCardDocs = await db.collection("custom_cards")
          .find({ id: { $in: customIds }, playerId: localId })
          .toArray();
        if (customCardDocs.length !== customIds.length)
          return res.status(400).json({ error: "One or more custom cards not found" });
      }

      // Validate tier composition: exactly 5×Standard(27) + 2×Focused(24) + 2×Specialist(21)
      const tierCounts = { 27: 0, 24: 0, 21: 0 };
      for (const id of standardIds) {
        const card = CARD_MAP[id];
        if (!card) return res.status(400).json({ error: "Unknown card: " + id });
        const tier = card.attrs.reduce((a, b) => a + b, 0);
        tierCounts[tier] = (tierCounts[tier] || 0) + 1;
      }
      for (const card of customCardDocs) {
        const tier = card.attrs.reduce((a, b) => a + b, 0);
        tierCounts[tier] = (tierCounts[tier] || 0) + 1;
      }
      if ((tierCounts[27]||0) !== 5 || (tierCounts[24]||0) !== 2 || (tierCounts[21]||0) !== 2)
        return res.status(400).json({ error: "Hand must contain 5 Standard, 2 Focused, and 2 Specialist cards" });

      const key = pNum === 1 ? "match.p1Hand" : "match.p2Hand";
      update[key] = data;

      const otherHand = pNum === 1 ? m.p2Hand : m.p1Hand;
      if (otherHand) {
        update.status = "playing";
        update["match.seq"]     = genSeq();
        update["match.round"]   = 0;
        update["match.score"]   = [0, 0];
        update["match.carry"]   = 0;
        update["match.history"] = [];
        update["match.p1Play"]  = null;
        update["match.p2Play"]  = null;
      }

      await games.updateOne({ _id: game._id }, { $set: update });
      return res.status(200).json({ ok: true });
    }

    // ── PLAY CARD ──
    if (action === "play") {
      if (game.status !== "playing") return res.status(400).json({ error: "Not in playing phase" });

      const cardId = data;
      if (!cardId) return res.status(400).json({ error: "Invalid card" });

      const card = await resolveCard(db, cardId, localId);
      if (!card) return res.status(400).json({ error: "Invalid card" });

      const hand = pNum === 1 ? m.p1Hand : m.p2Hand;
      if (!hand.includes(cardId)) return res.status(400).json({ error: "Card not in hand" });
      const playedIds = new Set(m.history.map(h => pNum === 1 ? h.p1CardId : h.p2CardId));
      if (playedIds.has(cardId)) return res.status(400).json({ error: "Card already played" });

      const myPlay = pNum === 1 ? m.p1Play : m.p2Play;
      if (myPlay) return res.status(400).json({ error: "Already played this round" });

      const playKey = pNum === 1 ? "match.p1Play" : "match.p2Play";
      update[playKey] = cardId;

      // If opponent is bot, auto-play now in the same update
      const opponentIsBot = pNum === 1 ? game.p2?.isBot : game.p1?.isBot;
      let otherPlay = pNum === 1 ? m.p2Play : m.p1Play;
      if (!otherPlay && opponentIsBot) {
        const botPNum = pNum === 1 ? 2 : 1;
        const botHand = pNum === 1 ? m.p2Hand : m.p1Hand;
        const botCardId = botPickCard(botHand, m.history, m.seq[m.round], botPNum);
        const botPlayKey = pNum === 1 ? "match.p2Play" : "match.p1Play";
        update[botPlayKey] = botCardId;
        otherPlay = botCardId;
      }

      if (otherPlay) {
        const p1CardId = pNum === 1 ? cardId : otherPlay;
        const p2CardId = pNum === 1 ? otherPlay : cardId;
        const p1LocalId = game.p1?.localId;
        const p2LocalId = game.p2?.localId;
        const p1Card = await resolveCard(db, p1CardId, p1LocalId);
        const p2Card = await resolveCard(db, p2CardId, p2LocalId);

        const attr = m.seq[m.round];
        const p1v = p1Card.attrs[attr];
        const p2v = p2Card.attrs[attr];
        const pts = 1 + m.carry;

        let winner = "tie";
        let newCarry = m.carry;
        const newScore = [...m.score];

        if (p1v > p2v)      { winner = "p1"; newScore[0] += pts; newCarry = 0; }
        else if (p2v > p1v) { winner = "p2"; newScore[1] += pts; newCarry = 0; }
        else                { newCarry = m.carry + 1; }

        const roundResult = {
          round: m.round, attr,
          p1CardId, p2CardId,
          p1Attrs: p1Card.attrs, p2Attrs: p2Card.attrs,
          p1v, p2v, winner, pts,
        };

        const newHistory = [...m.history, roundResult];
        const newRound = m.round + 1;

        update["match.history"] = newHistory;
        update["match.score"]   = newScore;
        update["match.carry"]   = newCarry;
        update["match.round"]   = newRound;
        update["match.p1Play"]  = null;
        update["match.p2Play"]  = null;

        const rem = 9 - newRound;
        const matchOver = newRound >= 9 ||
          newScore[0] > newScore[1] + rem + newCarry ||
          newScore[1] > newScore[0] + rem + newCarry;

        if (matchOver) {
          const newSeriesScore = [...game.seriesScore];
          if (newScore[0] > newScore[1]) newSeriesScore[0]++;
          else if (newScore[1] > newScore[0]) newSeriesScore[1]++;
          update.seriesScore = newSeriesScore;
          update.status = (newSeriesScore[0] >= 2 || newSeriesScore[1] >= 2) ? "series_end" : "match_end";
        }
      }

      await games.updateOne({ _id: game._id }, { $set: update });
      return res.status(200).json({ ok: true });
    }

    // ── NEXT MATCH ──
    if (action === "next_match") {
      if (game.status !== "match_end") return res.status(400).json({ error: "Not in match_end phase" });

      update.status        = "hand";
      update.matchNum      = game.matchNum + 1;
      update["match.seq"]     = null;
      update["match.round"]   = 0;
      update["match.score"]   = [0, 0];
      update["match.carry"]   = 0;
      update["match.history"] = [];
      update["match.p1Hand"]  = null;
      update["match.p2Hand"]  = null;
      update["match.p1Play"]  = null;
      update["match.p2Play"]  = null;
      update["match.p1Roster"] = dealRoster();
      const newP2Roster = dealRoster();
      update["match.p2Roster"] = newP2Roster;

      // Bot auto-selects new hand immediately
      if (game.p2?.isBot) {
        update["match.p2Hand"] = botSelectHand(newP2Roster);
      }

      await games.updateOne({ _id: game._id }, { $set: update });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("action error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
