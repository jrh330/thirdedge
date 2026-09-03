"use strict";
/**
 * Match state machine — implements game-spec-v2.md §5, §7.
 *
 * Manages: round sequencing, Trade/Reclaim/Decline between rounds,
 * match-end cleanup (undo all Trades).
 */

const {
  DECK_SIZE,
  SEVEN_ALLOWANCE,
  RULE_SET,
} = require("./constants");
const { validateDeck } = require("./validate");
const { setupRound, submitMove, revealAndAdvance, resolveToReveal, advanceTurn, roundWinner } = require("./round");

// ── Match creation ────────────────────────────────────────────────────────────

/**
 * Create a new MatchState.
 * @param {string}   matchId
 * @param {string}   aId       player A id
 * @param {object[]} aDeck     array of card objects (12 cards)
 * @param {string}   bId
 * @param {object[]} bDeck
 * @param {string}   [ruleSet]
 * @param {object}   [opts]    e.g. { skipShuffle: true } for tests
 */
function createMatch(matchId, aId, aDeck, bId, bDeck, ruleSet = RULE_SET.FAMILY_WHEEL, opts = {}) {
  // Validate decks
  const aVal = validateDeck(aDeck, ruleSet);
  if (!aVal.ok) throw new Error(`Player A deck invalid: ${aVal.errors.join("; ")}`);
  const bVal = validateDeck(bDeck, ruleSet);
  if (!bVal.ok) throw new Error(`Player B deck invalid: ${bVal.errors.join("; ")}`);

  const decks = {
    [aId]: aDeck.map(c => c.id),
    [bId]: bDeck.map(c => c.id),
  };
  const cardById = buildCardById([...aDeck, ...bDeck]);

  const round = setupRound(1, aId, aDeck, bId, bDeck, opts);

  return {
    matchId,
    playerIds: [aId, bId],
    ruleSet,
    decks,                           // live decks (card ids); mutated by Trades
    cards: cardById,                 // id→card; all cards ever in this match
    roundsWon:  { [aId]: 0, [bId]: 0 },
    rounds:     [round],
    swaps:      [],
    winnerId:   null,
    opts,
  };
}

function buildCardById(cards) {
  const m = {};
  for (const c of cards) m[c.id] = c;
  return m;
}

// ── Move submission ───────────────────────────────────────────────────────────

function currentRound(match) {
  return match.rounds[match.rounds.length - 1];
}

function cardLookup(match) {
  return id => {
    const c = match.cards[id];
    if (!c) throw new Error(`Card not found: ${id}`);
    return c;
  };
}

/**
 * Submit a move for a player. Returns updated MatchState.
 * If both moves are now in, automatically resolves the turn.
 */
function submitPlayerMove(match, playerId, cardId, category) {
  let round = currentRound(match);

  round = submitMove(round, playerId, cardId, category, cardLookup(match));

  // Check if both moves are in
  const [a, b] = round.players;
  const bothIn = round.pending[a.playerId] && round.pending[b.playerId];

  let updatedMatch = replaceCurrentRound(match, round);

  if (bothIn) {
    updatedMatch = resolveCurrentTurn(updatedMatch);
  }
  return updatedMatch;
}

function resolveCurrentTurn(match) {
  const round = currentRound(match);

  // Opening turn: use revealAndAdvance directly (goes straight to commit)
  if (round.phase === "opening") {
    const { round: newRound } = revealAndAdvance(round, cardLookup(match), match.ruleSet);
    return replaceCurrentRound(match, newRound);
  }

  // Normal turn: stop at "reveal" phase
  const { round: revealRound } = resolveToReveal(round, cardLookup(match), match.ruleSet);
  return replaceCurrentRound(match, revealRound);
}

/**
 * Advance past the "reveal" phase, applying slide and checking for round end.
 * @param {object} match  current round must be in "reveal" phase
 * @returns {MatchState}
 */
function advanceMatchTurn(match) {
  const round = currentRound(match);
  if (round.phase !== "reveal") throw new Error("Current round is not in 'reveal' phase");

  const newRound = advanceTurn(round);
  let updatedMatch = replaceCurrentRound(match, newRound);

  // Handle special round phases
  if (newRound.phase === "exhausted-tied") {
    updatedMatch = startNextRound(updatedMatch, /* replay */ true);
  } else if (newRound.phase === "over") {
    updatedMatch = handleRoundOver(updatedMatch);
  }

  return updatedMatch;
}

// ── Round over handling ───────────────────────────────────────────────────────

function handleRoundOver(match) {
  const round = currentRound(match);
  const winner = roundWinner(round);
  if (!winner) return match;  // shouldn't happen at phase=over

  const updatedWon = {
    ...match.roundsWon,
    [winner]: match.roundsWon[winner] + 1,
  };

  let updatedMatch = { ...match, roundsWon: updatedWon };

  // Check match winner (first to 2)
  if (updatedWon[winner] >= 2) {
    updatedMatch = { ...updatedMatch, winnerId: winner };
    // Undo all trades on match end
    updatedMatch = undoAllTrades(updatedMatch);
    return updatedMatch;
  }

  // Otherwise move to trade phase
  const loser = match.playerIds.find(id => id !== winner);
  updatedMatch = {
    ...updatedMatch,
    pendingTrade: { winner, loser, roundIndex: round.index },
  };
  return updatedMatch;
}

// ── Trade ─────────────────────────────────────────────────────────────────────

/**
 * The round winner gives one of their cards to the loser and receives a random card back.
 * @param {object} match
 * @param {string} winnerId     must be match.pendingTrade.winner
 * @param {string} giveCardId   card from winner's deck to give away
 * @returns {MatchState}
 */
function executeTrade(match, winnerId, giveCardId) {
  const trade = match.pendingTrade;
  if (!trade) throw new Error("No pending trade");
  if (trade.winner !== winnerId) throw new Error("Only the round winner may initiate a Trade");

  const loserId = trade.loser;
  const winnerDeck = match.decks[winnerId].slice();
  const loserDeck  = match.decks[loserId].slice();

  // Remove giveCard from winner
  const giveIdx = winnerDeck.indexOf(giveCardId);
  if (giveIdx === -1) throw new Error(`Card ${giveCardId} not in winner's deck (not in winner's deck)`);
  winnerDeck.splice(giveIdx, 1);

  // Add giveCard to loser
  loserDeck.push(giveCardId);

  // Draw random card from loser (excluding the just-given card)
  const candidates = loserDeck.filter(id => id !== giveCardId);
  if (candidates.length === 0) throw new Error("No candidates for random draw after trade");

  // Pick random; loop to ensure legality (§7: may not leave either deck illegal)
  let tookCardId = null;
  const shuffled = shuffleArr(candidates);
  for (const candidateId of shuffled) {
    // Simulate the draw
    const testLoser  = loserDeck.filter(id => id !== candidateId);
    const testWinner = [...winnerDeck, candidateId];

    const loserCards  = testLoser .map(id => match.cards[id]);
    const winnerCards = testWinner.map(id => match.cards[id]);

    const loserVal  = validateDeck(loserCards,  match.ruleSet);
    const winnerVal = validateDeck(winnerCards, match.ruleSet);

    if (loserVal.ok && winnerVal.ok) {
      tookCardId = candidateId;
      break;
    }
  }
  if (!tookCardId) throw new Error("No legal card to draw in this Trade");

  // Finalise deck mutations
  const finalLoser  = loserDeck.filter(id => id !== tookCardId);
  const finalWinner = [...winnerDeck, tookCardId];

  const swap = {
    afterRound: trade.roundIndex,
    by:         winnerId,
    gaveCardId: giveCardId,
    tookCardId: tookCardId,
    undone:     false,
  };

  const updatedMatch = {
    ...match,
    decks: {
      ...match.decks,
      [winnerId]: finalWinner,
      [loserId]:  finalLoser,
    },
    swaps:        [...match.swaps, swap],
    pendingTrade: null,
  };

  return startNextRound(updatedMatch);
}

/**
 * The round winner reclaims a previous Trade — both cards return home.
 * @param {object} match
 * @param {string} winnerId
 * @param {number} swapIndex  index in match.swaps of the swap to undo
 */
function executeReclaim(match, winnerId, swapIndex) {
  const trade = match.pendingTrade;
  if (!trade) throw new Error("No pending trade");
  if (trade.winner !== winnerId) throw new Error("Only the round winner may Reclaim");

  const swap = match.swaps[swapIndex];
  if (!swap || swap.undone) throw new Error("Swap not found or already undone");
  if (swap.by !== winnerId) throw new Error("Can only reclaim your own trade");

  const loserId = trade.loser;
  let winnerDeck = match.decks[winnerId].slice();
  let loserDeck  = match.decks[loserId].slice();

  // Return gaveCard from loser → winner
  const gaveIdx = loserDeck.indexOf(swap.gaveCardId);
  if (gaveIdx !== -1) loserDeck.splice(gaveIdx, 1);
  winnerDeck.push(swap.gaveCardId);

  // Return tookCard from winner → loser
  const tookIdx = winnerDeck.indexOf(swap.tookCardId);
  if (tookIdx !== -1) winnerDeck.splice(tookIdx, 1);
  loserDeck.push(swap.tookCardId);

  const updatedSwaps = match.swaps.map((s, i) =>
    i === swapIndex ? { ...s, undone: true } : s
  );

  const updatedMatch = {
    ...match,
    decks: {
      ...match.decks,
      [winnerId]: winnerDeck,
      [loserId]:  loserDeck,
    },
    swaps:        updatedSwaps,
    pendingTrade: null,
  };

  return startNextRound(updatedMatch);
}

/**
 * Decline the Trade — proceed straight to the next round.
 */
function declineTrade(match, winnerId) {
  const trade = match.pendingTrade;
  if (!trade) throw new Error("No pending trade");
  if (trade.winner !== winnerId) throw new Error("Only the round winner may Decline");

  return startNextRound({ ...match, pendingTrade: null });
}

// ── Match-end cleanup ─────────────────────────────────────────────────────────

/**
 * Undo every non-undone Trade in reverse order.
 * Card.ownerId never changes; this just restores decks.
 */
function undoAllTrades(match) {
  let decks = { ...match.decks };
  const swaps = match.swaps.slice();

  for (let i = swaps.length - 1; i >= 0; i--) {
    const s = swaps[i];
    if (s.undone) continue;

    // Return gaveCard to winner (from loser)
    const loserId = match.playerIds.find(id => id !== s.by);
    decks = {
      ...decks,
      [s.by]:    [...decks[s.by],   s.gaveCardId].filter(id => id !== s.tookCardId),
      [loserId]: [...decks[loserId], s.tookCardId].filter(id => id !== s.gaveCardId),
    };
    swaps[i] = { ...s, undone: true };
  }

  return { ...match, decks, swaps };
}

// ── Next round ────────────────────────────────────────────────────────────────

function startNextRound(match, replay = false) {
  const lastRound = currentRound(match);
  const nextIndex = replay ? lastRound.index : lastRound.index + 1;
  const [aId, bId] = match.playerIds;

  const aDeck = match.decks[aId].map(id => match.cards[id]);
  const bDeck = match.decks[bId].map(id => match.cards[id]);

  const newRound = setupRound(nextIndex, aId, aDeck, bId, bDeck, match.opts || {});

  return { ...match, rounds: [...match.rounds, newRound] };
}

function replaceCurrentRound(match, round) {
  const rounds = match.rounds.slice();
  rounds[rounds.length - 1] = round;
  return { ...match, rounds };
}

// ── Visibility helpers ────────────────────────────────────────────────────────

/**
 * Produce a client-safe view of the round for a given player.
 * pending is stripped; opponent's hand shows count only.
 */
function roundView(round, playerId) {
  const [a, b] = round.players;
  const mine   = a.playerId === playerId ? a : b;
  const theirs = a.playerId === playerId ? b : a;

  return {
    index: round.index,
    stake: round.stake,
    phase: round.phase,
    history: round.history,
    me: { ...mine },
    opponent: {
      playerId:   theirs.playerId,
      handCount:  theirs.hand.length,
      drawCount:  theirs.draw.length,
      anchor:     theirs.anchor,
      discard:    theirs.discard,
      points:     theirs.points,
    },
    // Only show committed move counts so opponent knows if we've submitted
    pendingCount: Object.keys(round.pending).length,
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function shuffleArr(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = {
  createMatch,
  submitPlayerMove,
  advanceMatchTurn,
  executeTrade,
  executeReclaim,
  declineTrade,
  undoAllTrades,
  startNextRound,
  roundView,
  currentRound,
};
