"use strict";
/**
 * Round state machine — implements game-spec-v2.md §5.2–§5.6.
 * All functions are pure: they return a new state, never mutate.
 */

const {
  HAND_SIZE,
  ROUND_POINTS,
  STAKE_CAP,
  RULE_SET,
} = require("./constants");
const { resolveTurn } = require("./resolve");

// ── Helpers ──────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function deal(draw, handSize) {
  return { hand: draw.slice(0, handSize), draw: draw.slice(handSize) };
}

// ── Round setup ───────────────────────────────────────────────────────────────

/**
 * Create a fresh RoundState.
 * @param {number}   index       1-based round number
 * @param {string}   aId        player A id
 * @param {object[]} aDeck      A's deck (array of card objects)
 * @param {string}   bId        player B id
 * @param {object[]} bDeck      B's deck
 * @param {object}   [opts]
 * @param {boolean}  [opts.skipShuffle]  for tests: do not shuffle
 * @returns {RoundState}
 */
function setupRound(index, aId, aDeck, bId, bDeck, opts = {}) {
  // Accept either card objects or card id strings; normalise to ids
  const toIds = deck => deck.map(c => (typeof c === "string" ? c : c.id));
  const aFull = opts.skipShuffle ? toIds(aDeck) : shuffle(toIds(aDeck));
  const bFull = opts.skipShuffle ? toIds(bDeck) : shuffle(toIds(bDeck));

  const aDealt = deal(aFull, HAND_SIZE);
  const bDealt = deal(bFull, HAND_SIZE);

  return {
    index,
    players: [
      { playerId: aId, draw: aDealt.draw, hand: aDealt.hand, anchor: null, discard: [], points: 0 },
      { playerId: bId, draw: bDealt.draw, hand: bDealt.hand, anchor: null, discard: [], points: 0 },
    ],
    stake:   1,
    phase:   "opening",
    pending: {},  // never serialised to clients
    history: [],
  };
}

// ── Pending move management ───────────────────────────────────────────────────

function playerIndex(round, playerId) {
  const i = round.players.findIndex(p => p.playerId === playerId);
  if (i === -1) throw new Error(`Unknown player: ${playerId}`);
  return i;
}

/**
 * Submit a move for one player. Returns new round state.
 * On the opening turn, category must be null.
 * @throws if the card isn't in the player's hand, or category is invalid.
 */
function submitMove(round, playerId, cardId, category, cardById) {
  const idx = playerIndex(round, playerId);
  const prs = round.players[idx];

  // Validate: card must be in hand
  if (!prs.hand.some(id => id === cardId))
    throw new Error(`Card ${cardId} is not in ${playerId}'s hand`);

  // Validate: category
  if (round.phase === "opening") {
    if (category != null)
      throw new Error("Category must be null on the opening turn");
  } else {
    if (!["power", "speed", "wits"].includes(category))
      throw new Error(`Invalid category: ${category}`);
  }

  // Record move (pending is the only mutable concern — we return a new object)
  const newPending = { ...round.pending, [playerId]: { cardId, category } };
  return { ...round, pending: newPending };
}

// ── Reveal ────────────────────────────────────────────────────────────────────

/**
 * Both moves are in. Resolve the turn and advance the round state.
 * @param {object}   round
 * @param {Function} cardById  id => card object
 * @param {string}   [ruleSet]
 * @returns {{ round: RoundState, result: TurnResult }}
 */
function revealAndAdvance(round, cardById, ruleSet = RULE_SET.FAMILY_WHEEL) {
  const [a, b] = round.players;
  const moveA = round.pending[a.playerId];
  const moveB = round.pending[b.playerId];

  if (!moveA || !moveB) throw new Error("Both moves must be submitted before reveal");

  // Opening turn: no resolution, cards become anchors
  if (round.phase === "opening") {
    const newPlayers = [
      {
        ...a,
        hand:    a.hand.filter(id => id !== moveA.cardId),
        anchor:  moveA.cardId,
        discard: a.discard,
        draw:    a.draw,
      },
      {
        ...b,
        hand:    b.hand.filter(id => id !== moveB.cardId),
        anchor:  moveB.cardId,
        discard: b.discard,
        draw:    b.draw,
      },
    ];
    // Draw back to HAND_SIZE
    const drawnPlayers = newPlayers.map(p => drawUp(p));
    return {
      round: { ...round, players: drawnPlayers, phase: "commit", pending: {}, history: round.history },
      result: null,
    };
  }

  // Normal turn: call resolveToReveal then advanceTurn
  const { round: revealRound, result } = resolveToReveal(round, cardById, ruleSet);
  const finalRound = advanceTurn(revealRound);

  return { round: finalRound, result };
}

/**
 * Resolve the turn and store results on round, stopping at "reveal" phase.
 * For opening turns, behaves exactly like revealAndAdvance (returns phase="commit").
 * @param {object}   round
 * @param {Function} cardById  id => card object
 * @param {string}   [ruleSet]
 * @returns {{ round: RoundState, result: TurnResult }}
 */
function resolveToReveal(round, cardById, ruleSet = RULE_SET.FAMILY_WHEEL) {
  const [a, b] = round.players;
  const moveA = round.pending[a.playerId];
  const moveB = round.pending[b.playerId];

  if (!moveA || !moveB) throw new Error("Both moves must be submitted before reveal");

  // Opening turn: no resolution, cards become anchors — goes straight to commit
  if (round.phase === "opening") {
    const newPlayers = [
      {
        ...a,
        hand:    a.hand.filter(id => id !== moveA.cardId),
        anchor:  moveA.cardId,
        discard: a.discard,
        draw:    a.draw,
      },
      {
        ...b,
        hand:    b.hand.filter(id => id !== moveB.cardId),
        anchor:  moveB.cardId,
        discard: b.discard,
        draw:    b.draw,
      },
    ];
    // Draw back to HAND_SIZE
    const drawnPlayers = newPlayers.map(p => drawUp(p));
    return {
      round: { ...round, players: drawnPlayers, phase: "commit", pending: {}, history: round.history },
      result: null,
    };
  }

  // Normal turn: resolve
  const aCard = cardById(moveA.cardId);
  const bCard = cardById(moveB.cardId);
  const aAnchor = cardById(a.anchor);
  const bAnchor = cardById(b.anchor);

  const result = resolveTurn({
    aAnchor, aPlayed: aCard, aCat: moveA.category,
    bAnchor, bPlayed: bCard, bCat: moveB.category,
    stake: round.stake,
    ruleSet,
  });

  // Award points
  let newA = { ...a }, newB = { ...b };
  if (result.winner === "a") newA = { ...newA, points: newA.points + result.stakeAwarded };
  if (result.winner === "b") newB = { ...newB, points: newB.points + result.stakeAwarded };

  const newHistory = [...round.history, result];

  // Store reveal data on round, set phase to "reveal", clear pending
  return {
    round: {
      ...round,
      players: [newA, newB],
      phase:   "reveal",
      pending: {},
      history: newHistory,
      lastResult:     result,
      lastPlayed:     { [a.playerId]: moveA.cardId, [b.playerId]: moveB.cardId },
      lastCategories: { [a.playerId]: moveA.category, [b.playerId]: moveB.category },
    },
    result,
  };
}

/**
 * Apply slide for both players and advance the round past the "reveal" phase.
 * Reads lastPlayed from round to know which cards were played.
 * @param {object} round  must be in "reveal" phase
 * @returns {RoundState}
 */
function advanceTurn(round) {
  if (round.phase !== "reveal") throw new Error("advanceTurn requires round in 'reveal' phase");

  const [a, b] = round.players;
  const lastPlayed = round.lastPlayed;

  // Apply slide for both players
  let newA = slide(a, lastPlayed[a.playerId]);
  let newB = slide(b, lastPlayed[b.playerId]);

  const newStake = round.lastResult.newStake;
  const newPlayers = [newA, newB];
  const { phase, extraLog } = checkRoundEnd(newPlayers, newStake);

  return {
    ...round,
    players: newPlayers,
    stake:   newStake,
    phase,
    lastResult:     undefined,
    lastPlayed:     undefined,
    lastCategories: undefined,
    _exhaustionNote: extraLog || undefined,
  };
}

// ── Slide ─────────────────────────────────────────────────────────────────────

function slide(prs, playedCardId) {
  const newDiscard = prs.anchor ? [...prs.discard, prs.anchor] : prs.discard;
  const newHand    = prs.hand.filter(id => id !== playedCardId);
  const { hand: drawnHand, draw: newDraw } = drawOne(newHand, prs.draw);
  return { ...prs, anchor: playedCardId, discard: newDiscard, hand: drawnHand, draw: newDraw };
}

function drawOne(hand, draw) {
  if (!draw.length) return { hand, draw };
  return { hand: [...hand, draw[0]], draw: draw.slice(1) };
}

function drawUp(prs) {
  let { hand, draw } = prs;
  while (hand.length < HAND_SIZE && draw.length > 0) {
    hand = [...hand, draw[0]];
    draw = draw.slice(1);
  }
  return { ...prs, hand, draw };
}

// ── Round end ─────────────────────────────────────────────────────────────────

/**
 * Returns { phase, extraLog } based on current player states.
 * Does not modify players.
 */
function checkRoundEnd(players, stake) {
  const [a, b] = players;

  if (a.points >= ROUND_POINTS || b.points >= ROUND_POINTS) {
    return { phase: "over" };
  }

  // Exhaustion guard
  const outOfCards = !a.hand.length || !b.hand.length;
  if (outOfCards) {
    if (a.points === b.points) {
      // Tied scores, replay round (caller must handle)
      return { phase: "exhausted-tied", extraLog: "Both decks ran dry at equal scores. Round replayed." };
    }
    // Whoever is ahead wins
    return { phase: "over", extraLog: `Cards ran out — round to higher score (${a.points}–${b.points}).` };
  }

  return { phase: "commit" };
}

/**
 * Returns which player won the round (playerId), or null if scores are level (replay).
 * Call when round.phase === "over" | "exhausted-tied".
 */
function roundWinner(round) {
  const [a, b] = round.players;
  if (round.phase === "exhausted-tied") return null;  // replay
  if (a.points > b.points) return a.playerId;
  if (b.points > a.points) return b.playerId;
  return null;  // shouldn't happen if checkRoundEnd is correct
}

module.exports = {
  setupRound,
  submitMove,
  revealAndAdvance,
  resolveToReveal,
  advanceTurn,
  roundWinner,
  drawUp,
  // exported for tests
  slide,
  checkRoundEnd,
};
