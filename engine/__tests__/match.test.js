'use strict';

const {
  createMatch,
  startGame,
  recordGameResult,
  swapCard,
  reclaimSwap,
  declinePostGame,
  finalizeMatch,
} = require('../match');
const {
  setupGame,
  submitOpeningPick,
  recruit,
  initiateChallenge,
  submitAttackStat,
  submitGuardStat,
  declineDefenderAbility,
  fireAttackerSmash,
  declineAttackerAbility,
  fireRally,
  passTurn,
  declineRally,
} = require('../game');
const { getCard } = require('../fixtures');

const P1 = 'player1';
const P2 = 'player2';

// deckAlpha: Bear(P5/Smash), Fox, Owl, Wolf, Elephant, Nutmeg, Teddy Roosevelt, Swiss Army Knife
const deckAlpha = [
  getCard('bear'),
  getCard('fox'),
  getCard('owl'),
  getCard('wolf'),
  getCard('elephant'),
  getCard('nutmeg'),
  getCard('teddy-roosevelt'),
  getCard('swiss-army-knife'),
];

// deckBeta: Hulk, Jimi Hendrix, Ghost, Platinum, Muhammad Ali, Poltergeist, Kraken, Wildfire
// Note: Wise Elder is invalid for deck use (Rally gate violation); Dragon+Jimi+Hulk+Kraken would be
// 4 five-stat cards (over limit), so Wildfire (P4,S4,W1 — no fives) is used instead of Dragon/Wise Elder.
const deckBeta = [
  getCard('hulk'),
  getCard('jimi-hendrix'),
  getCard('ghost'),
  getCard('platinum'),
  getCard('muhammad-ali'),
  getCard('poltergeist'),
  getCard('kraken'),
  getCard('wildfire'),
];

/**
 * Helper: force a game outcome by emptying both players then using deck-out.
 * Winner is the player whose team has higher total (P2's team KO'd, P1's intact).
 */
function forceP1Win(matchState) {
  let ms = startGame(matchState, P1, { skipShuffle: true });
  let gs = ms.currentGame;

  // Pick first available cards for opening
  const p1OpenCard = gs.players[P1].hand[0].id;
  const p2OpenCard = gs.players[P2].hand[0].id;
  gs = submitOpeningPick(gs, P1, p1OpenCard);
  gs = submitOpeningPick(gs, P2, p2OpenCard);
  while (gs.phase === 'rallyPending') gs = declineRally(gs);
  expect(gs.phase).toBe('turn');

  // KO P2's team and empty P2's hand/deck; also empty P1's hand/deck for deckOut
  gs = {
    ...gs,
    players: {
      ...gs.players,
      [P1]: { ...gs.players[P1], hand: [], deck: [] },
      [P2]: {
        ...gs.players[P2],
        hand: [],
        deck: [],
        team: gs.players[P2].team.map((cip) => ({ ...cip, knockedOut: true })),
      },
    },
  };

  // P1 has no hand, P2 has no standing → P1 can pass (no challenges possible)
  // P2 has no hand, no deck, no standing → P2 can pass
  gs = passTurn(gs); // P1 passes
  gs = passTurn(gs); // P2 passes
  // Deck-out: P1 has standing card (total > 0), P2 = 0 → P1 wins
  expect(gs.phase).toBe('gameOver');
  expect(gs.winnerId).toBe(P1);

  ms = { ...ms, currentGame: gs };
  return recordGameResult(ms);
}

/**
 * Simulate a complete game where P1 wins.
 * Returns the match state after recording game result.
 */
function simulateP1WinsGame(matchState) {
  return forceP1Win(matchState);
}

/**
 * Simulate a complete game where P2 wins.
 * Uses whatever cards are currently first in each player's hand (deck-agnostic after swaps).
 */
function simulateP2WinsGame(matchState) {
  let ms = startGame(matchState, P1, { skipShuffle: true });
  let gs = ms.currentGame;

  // Pick the first available card from each player's opening hand
  const p1OpenCard = gs.players[P1].hand[0].id;
  const p2OpenCard = gs.players[P2].hand[0].id;
  gs = submitOpeningPick(gs, P1, p1OpenCard);
  gs = submitOpeningPick(gs, P2, p2OpenCard);
  // Handle any rally pending from opening picks
  while (gs.phase === 'rallyPending') gs = declineRally(gs);
  expect(gs.phase).toBe('turn');

  // Force P2 win: KO all of P1's cards, empty P1's hand/deck
  // Then both pass → deckOut win for P2 (has standing card)
  function forceEmptyAndPassable(state, targetPlayerId) {
    return {
      ...state,
      players: {
        ...state.players,
        [targetPlayerId]: {
          ...state.players[targetPlayerId],
          hand: [],
          deck: [],
          team: state.players[targetPlayerId].team.map((cip) => ({ ...cip, knockedOut: true })),
        },
      },
    };
  }

  // Empty P1 so P1 can pass (no hand, no standing cards)
  gs = forceEmptyAndPassable(gs, P1);
  // Also empty P2's hand/deck so P2 can pass after P1
  gs = {
    ...gs,
    players: {
      ...gs.players,
      [P2]: { ...gs.players[P2], hand: [], deck: [] },
    },
  };

  // P1 has no standing cards and no hand → pass
  gs = passTurn(gs);
  // After P1 passes, advanceTurn makes P2 active and draws for P2 if deck non-empty
  // P2's deck is empty, so no draw. P2 has no hand, P1 has no standing → P2 can pass
  gs = passTurn(gs);
  // Deck-out: P1 total=0, P2 has standing card → P2 wins
  expect(gs.phase).toBe('gameOver');
  expect(gs.winnerId).toBe(P2);

  ms = { ...ms, currentGame: gs };
  return recordGameResult(ms);
}

// ---------------------------------------------------------------------------
// Test 1: Swap — cards move to correct decks, SwapRecord created
// ---------------------------------------------------------------------------
test('Swap: cards move to correct decks and SwapRecord is created', () => {
  let ms = createMatch(P1, P2, deckAlpha, deckBeta);
  ms = simulateP1WinsGame(ms);
  expect(ms.status).toBe('postGame');
  expect(ms.wins[P1]).toBe(1);

  // P1 won: P1 gives a card, takes one from P2's deck
  const p1Deck = ms.decks[P1];
  const p2Deck = ms.decks[P2];
  const giveCardId = p1Deck[0].id;    // P1 gives their first card
  const takeCardId = p2Deck[0].id;    // P1 takes P2's first card

  ms = swapCard(ms, giveCardId, takeCardId);

  // P1's deck should no longer have giveCardId, but have takeCardId
  expect(ms.decks[P1].find((c) => c.id === giveCardId)).toBeUndefined();
  expect(ms.decks[P1].find((c) => c.id === takeCardId)).toBeDefined();

  // P2's deck should no longer have takeCardId, but have giveCardId
  expect(ms.decks[P2].find((c) => c.id === takeCardId)).toBeUndefined();
  expect(ms.decks[P2].find((c) => c.id === giveCardId)).toBeDefined();

  // SwapRecord created
  expect(ms.swaps).toHaveLength(1);
  expect(ms.swaps[0].winnerGaveCardId).toBe(giveCardId);
  expect(ms.swaps[0].winnerTookCardId).toBe(takeCardId);
  expect(ms.swaps[0].undone).toBe(false);
});

// ---------------------------------------------------------------------------
// Test 2: Reclaim — prior swap reversed
// ---------------------------------------------------------------------------
test('Reclaim: prior swap is reversed correctly', () => {
  let ms = createMatch(P1, P2, deckAlpha, deckBeta);
  ms = simulateP1WinsGame(ms);

  const p1Deck = ms.decks[P1];
  const p2Deck = ms.decks[P2];
  const giveCardId = p1Deck[0].id;
  const takeCardId = p2Deck[0].id;

  ms = swapCard(ms, giveCardId, takeCardId);
  expect(ms.swaps).toHaveLength(1);

  // Reclaim the swap
  ms = reclaimSwap(ms, 0);

  // Cards should be back to original positions
  expect(ms.decks[P1].find((c) => c.id === giveCardId)).toBeDefined(); // back to P1
  expect(ms.decks[P1].find((c) => c.id === takeCardId)).toBeUndefined(); // gone from P1
  expect(ms.decks[P2].find((c) => c.id === takeCardId)).toBeDefined(); // back to P2
  expect(ms.decks[P2].find((c) => c.id === giveCardId)).toBeUndefined(); // gone from P2

  expect(ms.swaps[0].undone).toBe(true);
});

// ---------------------------------------------------------------------------
// Test 3: Decline — no deck changes
// ---------------------------------------------------------------------------
test('declinePostGame: no deck changes', () => {
  let ms = createMatch(P1, P2, deckAlpha, deckBeta);
  ms = simulateP1WinsGame(ms);
  expect(ms.status).toBe('postGame');

  const decksBefore = JSON.stringify(ms.decks);
  ms = declinePostGame(ms);
  expect(JSON.stringify(ms.decks)).toBe(decksBefore);
  expect(ms.status).toBe('postGame');
});

// ---------------------------------------------------------------------------
// Test 4: finalizeMatch — all non-undone swaps reversed
// ---------------------------------------------------------------------------
test('finalizeMatch: all non-undone swaps are reversed', () => {
  let ms = createMatch(P1, P2, deckAlpha, deckBeta);
  ms = simulateP1WinsGame(ms); // P1 wins game 1
  expect(ms.status).toBe('postGame');

  const p1Deck = ms.decks[P1];
  const p2Deck = ms.decks[P2];
  const giveCardId = p1Deck[0].id;
  const takeCardId = p2Deck[0].id;

  ms = swapCard(ms, giveCardId, takeCardId); // Swap 0

  // Now simulate P2 winning game 2 to complete the match
  ms = simulateP2WinsGame(ms); // P2 wins game 2 → match goes to postGame
  expect(ms.status).toBe('postGame');

  // P2 won game 2, so now P2 gives a card
  // But the swap from game 1 is still there (undone=false)
  // Simulate another swap (game 2 winner = P2)
  const p2DeckNow = ms.decks[P2];
  const p1DeckNow = ms.decks[P1];
  // P2 won, so P2 gives a card to P1
  // swapCard(matchState, winnerGaveCardId, winnerTookCardId)
  // winnerGaveCardId = P2's card, winnerTookCardId = P1's card
  if (p2DeckNow.length > 0 && p1DeckNow.length > 0) {
    ms = swapCard(ms, p2DeckNow[0].id, p1DeckNow[0].id);
  }

  // Now simulate P1 winning game 3 → match complete
  ms = simulateP1WinsGame(ms);
  expect(ms.status).toBe('complete');

  const decksBefore = {
    [P1]: [...ms.decks[P1].map((c) => c.id)],
    [P2]: [...ms.decks[P2].map((c) => c.id)],
  };

  ms = finalizeMatch(ms);

  // All swaps should be undone now
  expect(ms.swaps.every((s) => s.undone)).toBe(true);

  // Decks should be back to original state (all swaps reversed)
  // Original decks:
  const originalAlphaIds = deckAlpha.map((c) => c.id).sort();
  const originalBetaIds = deckBeta.map((c) => c.id).sort();
  expect(ms.decks[P1].map((c) => c.id).sort()).toEqual(originalAlphaIds);
  expect(ms.decks[P2].map((c) => c.id).sort()).toEqual(originalBetaIds);
});

// ---------------------------------------------------------------------------
// Test 5: Best-of-3 — two game wins → status='complete'
// ---------------------------------------------------------------------------
test('Best-of-3: two game wins → status=complete', () => {
  let ms = createMatch(P1, P2, deckAlpha, deckBeta);
  expect(ms.status).toBe('active');

  // Game 1: P1 wins
  ms = simulateP1WinsGame(ms);
  expect(ms.status).toBe('postGame');
  expect(ms.wins[P1]).toBe(1);
  expect(ms.winnerId).toBeNull();

  ms = declinePostGame(ms);

  // Game 2: P1 wins again
  ms = simulateP1WinsGame(ms);
  expect(ms.status).toBe('complete');
  expect(ms.wins[P1]).toBe(2);
  expect(ms.winnerId).toBe(P1);
});

/**
 * Simulate game 1 specifically using Bear+Hulk where Bear fires Smash,
 * so that bear.abilityRevealed is set to true. P1 wins.
 */
function simulateP1WinsWithBearSmash(matchState) {
  let ms = startGame(matchState, P1, { skipShuffle: true });
  let gs = ms.currentGame;

  // Opening picks: bear for P1, hulk for P2 (both in first 4 of their decks)
  gs = submitOpeningPick(gs, P1, 'bear');
  gs = submitOpeningPick(gs, P2, 'hulk');
  while (gs.phase === 'rallyPending') gs = declineRally(gs);
  expect(gs.phase).toBe('turn');

  // Empty P2's hand and deck so elimination is possible
  gs = {
    ...gs,
    players: {
      ...gs.players,
      [P2]: { ...gs.players[P2], hand: [], deck: [] },
    },
  };

  // P1 challenges hulk with bear, fires attacker Smash
  gs = initiateChallenge(gs, 'bear', 'hulk');
  gs = submitAttackStat(gs, 'power');
  gs = submitGuardStat(gs, 'speed');
  gs = declineDefenderAbility(gs);
  gs = fireAttackerSmash(gs);
  // Bear 5+2=7 > Hulk 5 → Hulk KO'd → P2 has no cards → elimination → P1 wins

  expect(gs.phase).toBe('gameOver');
  expect(gs.winnerId).toBe(P1);
  // bear should have abilityRevealed=true
  const bearCIP = gs.players[P1].team.find((c) => c.card.id === 'bear');
  expect(bearCIP.abilityRevealed).toBe(true);

  ms = { ...ms, currentGame: gs };
  return recordGameResult(ms);
}

// ---------------------------------------------------------------------------
// Test 6: abilityRevealed persists game-to-game within match
// ---------------------------------------------------------------------------
test('abilityRevealed persists game-to-game within match', () => {
  let ms = createMatch(P1, P2, deckAlpha, deckBeta);

  // Game 1: P1 wins, bear fires Smash (abilityRevealed=true)
  ms = simulateP1WinsWithBearSmash(ms);

  // Verify bear's abilityRevealed is captured in match state
  expect(ms.abilityRevealed['bear']).toBe(true);

  ms = declinePostGame(ms);

  // Game 2: start fresh but abilityRevealed map carries over
  ms = startGame(ms, P1, { skipShuffle: true });
  const gs = ms.currentGame;

  // After opening picks, bear's abilityRevealed should be true
  let gs2 = submitOpeningPick(gs, P1, 'bear');
  gs2 = submitOpeningPick(gs2, P2, 'hulk');
  while (gs2.phase === 'rallyPending') gs2 = declineRally(gs2);

  // Bear should have abilityRevealed=true from previous game
  const bearCIP = gs2.players[P1].team.find((c) => c.card.id === 'bear');
  expect(bearCIP.abilityRevealed).toBe(true);
});

// ---------------------------------------------------------------------------
// Test 7: abilityUsed resets each game
// ---------------------------------------------------------------------------
test('abilityUsed resets each game', () => {
  let ms = createMatch(P1, P2, deckAlpha, deckBeta);

  // Game 1: P1 wins, bear fires Smash (abilityUsed=true within game)
  ms = simulateP1WinsWithBearSmash(ms);

  ms = declinePostGame(ms);

  // Game 2: start fresh
  ms = startGame(ms, P1, { skipShuffle: true });
  const gs = ms.currentGame;

  let gs2 = submitOpeningPick(gs, P1, 'bear');
  gs2 = submitOpeningPick(gs2, P2, 'hulk');
  while (gs2.phase === 'rallyPending') gs2 = declineRally(gs2);

  // Bear's abilityUsed should be false (reset each game)
  const bearCIP = gs2.players[P1].team.find((c) => c.card.id === 'bear');
  expect(bearCIP.abilityUsed).toBe(false);

  // But abilityRevealed should still be true
  expect(bearCIP.abilityRevealed).toBe(true);
});
