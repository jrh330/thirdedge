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

    // hijack flag is sent alongside the play action
    const wantsHijack = !!req.body.hijack;

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
        return res.status(400).json({ error: "Hand must contain 5 Standard, 2 Focused, and 2 Specialist cards" });

      const key = pNum === 1 ? "match.p1Hand" : "match.p2Hand";
      update[key] = data;

      const otherHand = pNum === 1 ? m.p2Hand : m.p1Hand;
      if (otherHand) {
        update.status = "playing";
        update["match.seq"]            = genSeq();
        update["match.round"]          = 0;
        update["match.score"]          = [0, 0];
        update["match.carry"]          = 0;
        update["match.history"]        = [];
        update["match.p1Play"]         = null;
        update["match.p2Play"]         = null;
        update["match.p1HijackUsed"]   = false;
        update["match.p2HijackUsed"]   = false;
        update["match.p1HijackPending"] = false;
        update["match.p2HijackPending"] = false;
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

      // Validate hijack availability
      if (wantsHijack) {
        const alreadyUsed = pNum === 1 ? m.p1HijackUsed : m.p2HijackUsed;
        if (alreadyUsed) return res.status(400).json({ error: "Hijack already used this match" });
      }

      const playKey    = pNum === 1 ? "match.p1Play"         : "match.p2Play";
      const hijackKey  = pNum === 1 ? "match.p1HijackPending" : "match.p2HijackPending";
      const usedKey    = pNum === 1 ? "match.p1HijackUsed"    : "match.p2HijackUsed";
      update[playKey] = cardId;
      if (wantsHijack) {
        update[hijackKey] = true;
        update[usedKey]   = true;
      }

      // If opponent is bot, auto-play (bot never hijacks)
      const opponentIsBot = pNum === 1 ? game.p2?.isBot : game.p1?.isBot;
      let otherPlay           = pNum === 1 ? m.p2Play          : m.p1Play;
      let otherHijackPending  = pNum === 1 ? m.p2HijackPending : m.p1HijackPending;
      if (!otherPlay && opponentIsBot) {
        const botPNum = pNum === 1 ? 2 : 1;
        const botHand = pNum === 1 ? m.p2Hand : m.p1Hand;
        const botCardId = botPickCard(botHand, m.history, botPNum);
        const botPlayKey = pNum === 1 ? "match.p2Play" : "match.p1Play";
        update[botPlayKey] = botCardId;
        otherPlay = botCardId;
        otherHijackPending = false;
      }

      if (otherPlay) {
        const p1CardId   = pNum === 1 ? cardId    : otherPlay;
        const p2CardId   = pNum === 1 ? otherPlay : cardId;
        const p1Hijacked = pNum === 1 ? wantsHijack : otherHijackPending;
        const p2Hijacked = pNum === 1 ? otherHijackPending : wantsHijack;

        const p1LocalId = game.p1?.localId;
        const p2LocalId = game.p2?.localId;
        const p1Card = await resolveCard(db, p1CardId, p1LocalId);
        const p2Card = await resolveCard(db, p2CardId, p2LocalId);

        const attr = m.seq[m.round];

        // Determine hijack outcome:
        //   both hijack → Double Hijack, cancels out, no swap
        //   one hijack  → swap cards for scoring
        //   neither     → normal
        const doubleHijack = p1Hijacked && p2Hijacked;
        const singleHijack = (p1Hijacked || p2Hijacked) && !doubleHijack;
        const hijackBy = doubleHijack ? "double" : p1Hijacked ? "p1" : p2Hijacked ? "p2" : null;

        // With a single hijack the cards swap sides for scoring
        const scoreP1Card = singleHijack ? p2Card : p1Card;
        const scoreP2Card = singleHijack ? p1Card : p2Card;

        const p1v = scoreP1Card.attrs[attr];
        const p2v = scoreP2Card.attrs[attr];
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
          hijack: hijackBy,   // null | "p1" | "p2" | "double"
        };

        const newHistory = [...m.history, roundResult];
        const newRound = m.round + 1;

        update["match.history"]         = newHistory;
        update["match.score"]           = newScore;
        update["match.carry"]           = newCarry;
        update["match.round"]           = newRound;
        update["match.p1Play"]          = null;
        update["match.p2Play"]          = null;
        update["match.p1HijackPending"] = false;
        update["match.p2HijackPending"] = false;

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
      update["match.seq"]             = null;
      update["match.round"]           = 0;
      update["match.score"]           = [0, 0];
      update["match.carry"]           = 0;
      update["match.history"]         = [];
      update["match.p1Hand"]          = null;
      update["match.p2Hand"]          = null;
      update["match.p1Play"]          = null;
      update["match.p2Play"]          = null;
      update["match.p1HijackUsed"]    = false;
      update["match.p2HijackUsed"]    = false;
      update["match.p1HijackPending"] = false;
      update["match.p2HijackPending"] = false;
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
