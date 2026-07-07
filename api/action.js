const { getDb } = require("./_db");
const { genSeq, dealRoster, botSelectHand, CARD_MAP } = require("./_game");
const { TIERS, HAND_PICKS } = require("./_constants");

// Bot: pick highest total-value unplayed card (no knowledge of current attribute)
function botPickCard(hand, history, botPNum) {
  const played = new Set(history.map(h => botPNum === 2 ? h.p2CardId : h.p1CardId));
  const available = hand.filter(id => !played.has(id));
  let best = null, bestVal = -1;
  for (const id of available) {
    const card = CARD_MAP[id];
    if (card) {
      const total = card.attrs.reduce((a, b) => a + b, 0);
      if (total > bestVal) { bestVal = total; best = id; }
    }
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
      if (!Array.isArray(data) || data.length !== 10) return res.status(400).json({ error: "Need exactly 10 card IDs" });

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

      // Validate tier composition using HAND_PICKS
      const tierCounts = {};
      TIERS.forEach(t => { tierCounts[t] = 0; });
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
      if (TIERS.some(t => (tierCounts[t] || 0) !== HAND_PICKS[t]))
        return res.status(400).json({ error: "Hand must contain 6 Standard, 2 Focused, and 2 Specialist cards" });

      const key = pNum === 1 ? "match.p1Hand" : "match.p2Hand";
      update[key] = data;

      const otherHand = pNum === 1 ? m.p2Hand : m.p1Hand;
      if (otherHand) {
        update.status = "playing";
        update["match.seq"]           = genSeq();
        update["match.round"]         = 0;
        update["match.score"]         = [0, 0];
        update["match.carry"]         = 0;
        update["match.history"]       = [];
        update["match.p1Play"]        = null;
        update["match.p2Play"]        = null;
        update["match.p1DoubleUsed"]  = false;
        update["match.p2DoubleUsed"]  = false;
      }

      await games.updateOne({ _id: game._id }, { $set: update });
      return res.status(200).json({ ok: true });
    }

    // ── PLAY CARD (supports Double Up: data may be a single cardId or [cardId1, cardId2]) ──
    if (action === "play") {
      if (game.status !== "playing") return res.status(400).json({ error: "Not in playing phase" });

      const myPlay = pNum === 1 ? m.p1Play : m.p2Play;
      if (myPlay) return res.status(400).json({ error: "Already played this round" });

      const isDouble = Array.isArray(data);
      const cardIds = isDouble ? data : [data];

      if (isDouble) {
        if (cardIds.length !== 2) return res.status(400).json({ error: "Double Up requires exactly 2 cards" });
        const alreadyUsed = pNum === 1 ? m.p1DoubleUsed : m.p2DoubleUsed;
        if (alreadyUsed) return res.status(400).json({ error: "Double Up already used this match" });
      }

      if (!cardIds.every(id => id)) return res.status(400).json({ error: "Invalid card" });

      const hand = pNum === 1 ? m.p1Hand : m.p2Hand;
      const playedIds = new Set(m.history.flatMap(h =>
        pNum === 1 ? [h.p1CardId, ...(h.p1CardId2 ? [h.p1CardId2] : [])]
                   : [h.p2CardId, ...(h.p2CardId2 ? [h.p2CardId2] : [])]
      ));

      for (const id of cardIds) {
        if (!hand.includes(id)) return res.status(400).json({ error: "Card not in hand: " + id });
        if (playedIds.has(id))  return res.status(400).json({ error: "Card already played: " + id });
      }
      if (isDouble && cardIds[0] === cardIds[1]) return res.status(400).json({ error: "Must play two different cards" });

      // Validate cards exist
      for (const id of cardIds) {
        const card = await resolveCard(db, id, localId);
        if (!card) return res.status(400).json({ error: "Invalid card: " + id });
      }

      // Store play as single ID or "id1+id2" string to keep schema simple
      const playValue = isDouble ? cardIds.join("+") : cardIds[0];
      const playKey = pNum === 1 ? "match.p1Play" : "match.p2Play";
      update[playKey] = playValue;
      if (isDouble) {
        const doubleKey = pNum === 1 ? "match.p1DoubleUsed" : "match.p2DoubleUsed";
        update[doubleKey] = true;
      }

      // If opponent is bot, auto-play now in the same update
      const opponentIsBot = pNum === 1 ? game.p2?.isBot : game.p1?.isBot;
      let otherPlay = pNum === 1 ? m.p2Play : m.p1Play;
      if (!otherPlay && opponentIsBot) {
        const botPNum = pNum === 1 ? 2 : 1;
        const botHand = pNum === 1 ? m.p2Hand : m.p1Hand;
        const botCardId = botPickCard(botHand, m.history, botPNum);
        const botPlayKey = pNum === 1 ? "match.p2Play" : "match.p1Play";
        update[botPlayKey] = botCardId;
        otherPlay = botCardId;
      }

      if (otherPlay) {
        // Parse plays — could be "id" or "id1+id2"
        const myPlayVal = playValue;
        const [myId1, myId2] = myPlayVal.includes("+") ? myPlayVal.split("+") : [myPlayVal, null];
        const [opId1, opId2] = otherPlay.includes("+") ? otherPlay.split("+") : [otherPlay, null];

        const p1PlayVal = pNum === 1 ? myPlayVal : otherPlay;
        const p2PlayVal = pNum === 1 ? otherPlay : myPlayVal;
        const [p1Id1, p1Id2] = p1PlayVal.includes("+") ? p1PlayVal.split("+") : [p1PlayVal, null];
        const [p2Id1, p2Id2] = p2PlayVal.includes("+") ? p2PlayVal.split("+") : [p2PlayVal, null];

        const p1LocalId = game.p1?.localId;
        const p2LocalId = game.p2?.localId;

        const p1Card1 = await resolveCard(db, p1Id1, p1LocalId);
        const p1Card2 = p1Id2 ? await resolveCard(db, p1Id2, p1LocalId) : null;
        const p2Card1 = await resolveCard(db, p2Id1, p2LocalId);
        const p2Card2 = p2Id2 ? await resolveCard(db, p2Id2, p2LocalId) : null;

        const attr = m.seq[m.round];
        const p1v = p1Card1.attrs[attr] + (p1Card2 ? p1Card2.attrs[attr] : 0);
        const p2v = p2Card1.attrs[attr] + (p2Card2 ? p2Card2.attrs[attr] : 0);
        const pts = 1 + m.carry;

        let winner = "tie";
        let newCarry = m.carry;
        const newScore = [...m.score];

        if (p1v > p2v)      { winner = "p1"; newScore[0] += pts; newCarry = 0; }
        else if (p2v > p1v) { winner = "p2"; newScore[1] += pts; newCarry = 0; }
        else                { newCarry = m.carry + 1; }

        const roundResult = {
          round: m.round, attr,
          p1CardId: p1Id1, p1CardId2: p1Id2 || null,
          p2CardId: p2Id1, p2CardId2: p2Id2 || null,
          p1Attrs: p1Card1.attrs, p2Attrs: p2Card1.attrs,
          p1v, p2v, winner, pts,
          p1Double: !!p1Id2, p2Double: !!p2Id2,
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
      update["match.seq"]          = null;
      update["match.round"]        = 0;
      update["match.score"]        = [0, 0];
      update["match.carry"]        = 0;
      update["match.history"]      = [];
      update["match.p1Hand"]       = null;
      update["match.p2Hand"]       = null;
      update["match.p1Play"]       = null;
      update["match.p2Play"]       = null;
      update["match.p1DoubleUsed"] = false;
      update["match.p2DoubleUsed"] = false;
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
