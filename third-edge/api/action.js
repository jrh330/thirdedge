const { getDb } = require("./_db");
const { validateCardIds, genSeq, ALL_CARDS } = require("./_game");

const CARD_MAP = {};
ALL_CARDS.forEach(c => { CARD_MAP[c.id] = c; });

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

    const m = game.match;
    const update = { updatedAt: new Date() };

    // ── ROSTER ──
    if (action === "roster") {
      if (game.status !== "roster") return res.status(400).json({ error: "Not in roster phase" });
      if (!validateCardIds(data, 12)) return res.status(400).json({ error: "Invalid roster: need 12 valid card IDs" });

      const key = pNum === 1 ? "match.p1Roster" : "match.p2Roster";
      update[key] = data;

      // Check if both rosters are in
      const otherRoster = pNum === 1 ? m.p2Roster : m.p1Roster;
      if (otherRoster) {
        update.status = "hand";
      }

      await games.updateOne({ _id: game._id }, { $set: update });
      return res.status(200).json({ ok: true });
    }

    // ── HAND ──
    if (action === "hand") {
      if (game.status !== "hand") return res.status(400).json({ error: "Not in hand phase" });
      if (!validateCardIds(data, 9)) return res.status(400).json({ error: "Invalid hand: need 9 valid card IDs" });

      // Validate all hand cards are in roster
      const roster = pNum === 1 ? m.p1Roster : m.p2Roster;
      if (!roster) return res.status(400).json({ error: "Roster not set" });
      const rosterSet = new Set(roster);
      if (!data.every(id => rosterSet.has(id))) return res.status(400).json({ error: "Hand cards must be from roster" });

      const key = pNum === 1 ? "match.p1Hand" : "match.p2Hand";
      update[key] = data;

      // Check if both hands are in → start playing
      const otherHand = pNum === 1 ? m.p2Hand : m.p1Hand;
      if (otherHand) {
        update.status = "playing";
        // Generate the sequence server-side (neither player has seen it)
        update["match.seq"] = genSeq();
        update["match.round"] = 0;
        update["match.score"] = [0, 0];
        update["match.carry"] = 0;
        update["match.history"] = [];
        update["match.p1Play"] = null;
        update["match.p2Play"] = null;
      }

      await games.updateOne({ _id: game._id }, { $set: update });
      return res.status(200).json({ ok: true });
    }

    // ── PLAY CARD ──
    if (action === "play") {
      if (game.status !== "playing") return res.status(400).json({ error: "Not in playing phase" });

      const cardId = data;
      if (!cardId || !CARD_MAP[cardId]) return res.status(400).json({ error: "Invalid card" });

      // Check card is in player's hand and not already played
      const hand = pNum === 1 ? m.p1Hand : m.p2Hand;
      if (!hand.includes(cardId)) return res.status(400).json({ error: "Card not in hand" });
      const playedIds = new Set(m.history.map(h => pNum === 1 ? h.p1CardId : h.p2CardId));
      if (playedIds.has(cardId)) return res.status(400).json({ error: "Card already played" });

      // Check not already submitted this round
      const myPlay = pNum === 1 ? m.p1Play : m.p2Play;
      if (myPlay) return res.status(400).json({ error: "Already played this round" });

      const playKey = pNum === 1 ? "match.p1Play" : "match.p2Play";
      update[playKey] = cardId;

      // Check if both plays are in → resolve round
      const otherPlay = pNum === 1 ? m.p2Play : m.p1Play;
      if (otherPlay) {
        const p1Card = CARD_MAP[pNum === 1 ? cardId : otherPlay];
        const p2Card = CARD_MAP[pNum === 1 ? otherPlay : cardId];
        const attr = m.seq[m.round];
        const p1v = p1Card.attrs[attr];
        const p2v = p2Card.attrs[attr];
        const pts = 1 + m.carry;

        let winner = "tie";
        let newCarry = m.carry;
        const newScore = [...m.score];

        if (p1v > p2v) { winner = "p1"; newScore[0] += pts; newCarry = 0; }
        else if (p2v > p1v) { winner = "p2"; newScore[1] += pts; newCarry = 0; }
        else { newCarry = m.carry + 1; }

        const roundResult = {
          round: m.round,
          attr,
          p1CardId: pNum === 1 ? cardId : otherPlay,
          p2CardId: pNum === 1 ? otherPlay : cardId,
          p1Attrs: p1Card.attrs,
          p2Attrs: p2Card.attrs,
          p1v, p2v,
          winner,
          pts,
        };

        const newHistory = [...m.history, roundResult];
        const newRound = m.round + 1;

        update["match.history"] = newHistory;
        update["match.score"] = newScore;
        update["match.carry"] = newCarry;
        update["match.round"] = newRound;
        update["match.p1Play"] = null;
        update["match.p2Play"] = null;

        // Check if match is over
        const rem = 9 - newRound;
        const matchOver = newRound >= 9 ||
          newScore[0] > newScore[1] + rem + newCarry ||
          newScore[1] > newScore[0] + rem + newCarry;

        if (matchOver) {
          // Update series score
          const newSeriesScore = [...game.seriesScore];
          if (newScore[0] > newScore[1]) newSeriesScore[0]++;
          else if (newScore[1] > newScore[0]) newSeriesScore[1]++;

          update.seriesScore = newSeriesScore;

          if (newSeriesScore[0] >= 2 || newSeriesScore[1] >= 2) {
            update.status = "series_end";
          } else {
            update.status = "match_end";
          }
        }
      }

      await games.updateOne({ _id: game._id }, { $set: update });
      return res.status(200).json({ ok: true });
    }

    // ── NEXT MATCH ──
    if (action === "next_match") {
      if (game.status !== "match_end") return res.status(400).json({ error: "Not in match_end phase" });

      // Only allow once (first player to click triggers it)
      update.status = "hand";
      update.matchNum = game.matchNum + 1;
      update["match.seq"] = null;
      update["match.round"] = 0;
      update["match.score"] = [0, 0];
      update["match.carry"] = 0;
      update["match.history"] = [];
      update["match.p1Hand"] = null;
      update["match.p2Hand"] = null;
      update["match.p1Play"] = null;
      update["match.p2Play"] = null;
      // Keep rosters

      await games.updateOne({ _id: game._id }, { $set: update });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("action error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
