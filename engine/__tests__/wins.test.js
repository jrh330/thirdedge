'use strict';

const {
  setupGame,
  submitOpeningPick,
  recruit,
  initiateChallenge,
  submitAttackStat,
  submitGuardStat,
  declineDefenderAbility,
  declineAttackerAbility,
  fireRally,
  passTurn,
} = require('../game');
const { getCard } = require('../fixtures');
const { GOAL_POINTS } = require('../constants');
const { getTeamTotal } = require('../bonds');

const P1 = 'player1';
const P2 = 'player2';

// deckAlpha: Bear, Fox, Owl, Wolf, Elephant, Nutmeg, Teddy Roosevelt, Swiss Army Knife
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

// deckBeta: Hulk, Jimi Hendrix, Ghost, Platinum, Muhammad Ali, Poltergeist, Kraken, Wise Elder
const deckBeta = [
  getCard('hulk'),
  getCard('jimi-hendrix'),
  getCard('ghost'),
  getCard('platinum'),
  getCard('muhammad-ali'),
  getCard('poltergeist'),
  getCard('kraken'),
  getCard('wise-elder'),
];

function makeGame(p1Deck = deckAlpha, p2Deck = deckBeta, p1Open = 'bear', p2Open = 'hulk') {
  let gs = setupGame(P1, P2, p1Deck, p2Deck, P1, 0, { skipShuffle: true });
  gs = submitOpeningPick(gs, P1, p1Open);
  gs = submitOpeningPick(gs, P2, p2Open);
  return gs;
}

// Helper to recruit all cards in hand
function recruitAll(gs, playerId) {
  let state = gs;
  while (state.players[playerId].hand.length > 0 && state.phase === 'turn' && state.activePlayerId === playerId) {
    const card = state.players[playerId].hand[0];
    state = recruit(state, card.id);
    // Handle any rally pending
    if (state.phase === 'rallyPending') {
      state = fireRally(state, null); // fire with no effect if needed or pick first available target
    }
  }
  return state;
}

// ---------------------------------------------------------------------------
// Test 1: Goal — team total >= 30 → win immediately after recruit
// ---------------------------------------------------------------------------
test('Goal: team total >= 30 triggers win after recruit', () => {
  // Recruit cards until a team total hits 30.
  // Bear+Fox bonded (24), then adding Owl (unbonded Beast, +9) = 33 ≥ 30 → win
  const bigDeck = [
    getCard('bear'), getCard('fox'), getCard('owl'), getCard('wolf'),
    getCard('elephant'), getCard('nutmeg'), getCard('teddy-roosevelt'), getCard('swiss-army-knife'),
  ];
  const smallDeck = [
    getCard('hulk'), getCard('jimi-hendrix'), getCard('ghost'), getCard('platinum'),
    getCard('muhammad-ali'), getCard('poltergeist'), getCard('kraken'), getCard('dragon'),
  ];

  let gs = setupGame(P1, P2, bigDeck, smallDeck, P1, 0, { skipShuffle: true });
  gs = submitOpeningPick(gs, P1, 'bear');
  gs = submitOpeningPick(gs, P2, 'hulk');
  // Both Smash → turn
  expect(gs.phase).toBe('turn');
  expect(gs.activePlayerId).toBe(P1);

  // P1 recruits fox → bear+fox bonded (both Beasts) → total 24, no win
  gs = recruit(gs, 'fox');
  expect(gs.phase).toBe('turn'); // P2's turn

  // P2 recruits from hand (Jimi Hendrix)
  gs = recruit(gs, gs.players[P2].hand[0].id);
  if (gs.phase === 'rallyPending') gs = fireRally(gs, null);
  expect(gs.phase).toBe('turn'); // back to P1

  // P1 recruits owl → bear+fox bonded (24) + owl standalone (9) = 33 ≥ 30 → win!
  gs = recruit(gs, 'owl');
  if (gs.phase === 'rallyPending') gs = fireRally(gs, null);

  expect(gs.phase).toBe('gameOver');
  expect(gs.winnerId).toBe(P1);
  expect(gs.winReason).toBe('goal');
});

test('Goal win condition: manually set up a team with total >= 30', () => {
  // More controlled: create a game state where P1 has 4 bonded beasts
  // that sum to ≥ 30, then recruit one more and verify gameOver
  // Bear(9) + Fox(9) + Owl(9) + Wolf(9) = 36 + 6 bond pairs = 42 ≥ 30
  // We need a deck with all 4 beasts and setup to recruit them all

  const bigDeck = [
    getCard('bear'), getCard('fox'), getCard('owl'), getCard('wolf'),
    getCard('elephant'), getCard('nutmeg'), getCard('teddy-roosevelt'), getCard('swiss-army-knife'),
  ];
  const smallDeck = [
    getCard('hulk'), getCard('jimi-hendrix'), getCard('ghost'), getCard('platinum'),
    getCard('muhammad-ali'), getCard('poltergeist'), getCard('kraken'), getCard('wise-elder'),
  ];

  let gs = setupGame(P1, P2, bigDeck, smallDeck, P1, 0, { skipShuffle: true });
  gs = submitOpeningPick(gs, P1, 'bear');  // Bear on team (9 pts base)
  gs = submitOpeningPick(gs, P2, 'hulk'); // Hulk on P2 team

  // After transition to turn, P1 draws fox (next in deck after first 4 dealt = elephant as 5th... wait)
  // bigDeck order: bear(0), fox(1), owl(2), wolf(3), elephant(4), nutmeg(5), teddy(6), sak(7)
  // OPENING_HAND=4 means hand = [fox,owl,wolf,elephant] (indices 1-4 after bear=0 was opened)
  // Wait: deck after shuffle: [bear,fox,owl,wolf,elephant,nutmeg,teddy,sak]
  // hand for P1 = deck[0..3] = [bear,fox,owl,wolf]
  // remaining deck = [elephant,nutmeg,teddy,sak]
  // P1 picked bear as opening pick → removed from hand → hand = [fox,owl,wolf]
  // On transition to turn: P1 draws elephant (deck[0]) → hand = [fox,owl,wolf,elephant]

  expect(gs.phase).toBe('turn');
  expect(gs.activePlayerId).toBe(P1);

  // Recruit fox → team: bear+fox (both beasts, bonded) = (5+1)+(4+1)+(2+1)+(1+1)+(4+1)+(4+1) = 6+5+3+2+5+5 = 26
  // Wait: bear(P5,S2,W2) + fox(P1,S4,W4), bonded: each +1 to effective
  // Team total = (5+1)+(2+1)+(2+1) + (1+1)+(4+1)+(4+1) = 6+3+3 + 2+5+5 = 12+12 = 24

  gs = recruit(gs, 'fox');
  expect(gs.phase).toBe('turn'); // P2's turn now, total 24 < 30

  // P2 recruits
  gs = recruit(gs, gs.players[P2].hand[0].id);
  if (gs.phase === 'rallyPending') gs = fireRally(gs, null);

  // P1 recruits owl → team: bear+fox bonded, owl alone (or 3-beast: bear+fox+owl where bear-fox are bonded, owl unbonded)
  // bear(P5,S2,W2)+fox(P1,S4,W4) bonded pair + owl(P1,S3,W5) unbonded
  // Total = 12+12 + 1+3+5 = 24+9 = 33 ≥ 30 → GOAL!
  gs = recruit(gs, 'owl');

  if (gs.phase === 'rallyPending') gs = fireRally(gs, null);

  expect(gs.phase).toBe('gameOver');
  expect(gs.winnerId).toBe(P1);
  expect(gs.winReason).toBe('goal');
});

// ---------------------------------------------------------------------------
// Test 2: Goal via bonds — bonded cards push total over 30
// ---------------------------------------------------------------------------
test('Goal via bonds: bond bonus contributes to hitting 30', () => {
  // Test that bonds are counted in the win-condition check
  // Use a scenario where cards total exactly 30 when bonded but < 30 unbonded
  // 3 cards: totals approach 30 via bonds
  // Bear+Fox+Owl: 9+9+9=27 base; bear-fox bonded (both Beast) = +3 each pair
  // bonded pair bear-fox: 12+12=24; owl unbonded: 9 → total=33

  const bigDeck = [
    getCard('bear'), getCard('fox'), getCard('owl'), getCard('wolf'),
    getCard('elephant'), getCard('nutmeg'), getCard('teddy-roosevelt'), getCard('swiss-army-knife'),
  ];
  const smallDeck = [
    getCard('hulk'), getCard('jimi-hendrix'), getCard('ghost'), getCard('platinum'),
    getCard('muhammad-ali'), getCard('poltergeist'), getCard('kraken'), getCard('wise-elder'),
  ];

  let gs = setupGame(P1, P2, bigDeck, smallDeck, P1, 0, { skipShuffle: true });
  gs = submitOpeningPick(gs, P1, 'bear');
  gs = submitOpeningPick(gs, P2, 'hulk');

  gs = recruit(gs, 'fox'); // P1 recruits fox (both beasts, bonded now); 24 < 30, no win yet
  expect(gs.phase).toBe('turn');

  gs = recruit(gs, gs.players[P2].hand[0].id); // P2's turn
  if (gs.phase === 'rallyPending') gs = fireRally(gs, null);

  gs = recruit(gs, 'owl'); // P1 recruits owl; now total = 33 → win!
  if (gs.phase === 'rallyPending') gs = fireRally(gs, null);

  expect(gs.phase).toBe('gameOver');
  expect(gs.winnerId).toBe(P1);
  expect(gs.winReason).toBe('goal');
});

// ---------------------------------------------------------------------------
// Test 3: Elimination — opponent has no cards anywhere
// ---------------------------------------------------------------------------
test('Elimination: opponent has no cards anywhere → win', () => {
  // Set up a game where P2 has only hulk on team, nothing in hand or deck
  // Then KO hulk → elimination
  let gs = makeGame(deckAlpha, deckBeta, 'bear', 'hulk');

  // Clear P2's hand and deck (simulate they've been exhausted)
  gs = {
    ...gs,
    players: {
      ...gs.players,
      [P2]: { ...gs.players[P2], hand: [], deck: [] },
    },
  };

  // Now challenge: KO hulk
  gs = initiateChallenge(gs, 'bear', 'hulk');
  gs = submitAttackStat(gs, 'power');
  gs = submitGuardStat(gs, 'speed');
  gs = declineDefenderAbility(gs);
  gs = fireAttackerSmash(gs);

  // Bear power+smash=7 > Hulk power=5 → Hulk KO'd
  // P2 has no cards anywhere → P1 wins by elimination
  expect(gs.phase).toBe('gameOver');
  expect(gs.winnerId).toBe(P1);
  expect(gs.winReason).toBe('elimination');
});

// Need fireAttackerSmash imported
const { fireAttackerSmash } = require('../game');

// ---------------------------------------------------------------------------
// Test 4: Deck-out — both pass, higher total wins
// ---------------------------------------------------------------------------
test('Deck-out: both players pass, higher total wins', () => {
  // Set up a game where both players have empty hands and no challenges possible
  // P1 has bear (KO'd), P2 has hulk standing → but can't challenge if attacker has no standing
  // Actually: both need to have no standing cards OR no hand + opponent's cards
  // passTurn requires: hand empty AND cannot challenge
  // "cannot challenge" = active player has no standing cards OR opponent has no standing cards

  let gs = makeGame(deckAlpha, deckBeta, 'bear', 'hulk');

  // KO bear so P1 has no standing cards
  gs = {
    ...gs,
    players: {
      ...gs.players,
      [P1]: {
        ...gs.players[P1],
        hand: [],
        deck: [],
        team: gs.players[P1].team.map((cip) => ({ ...cip, knockedOut: true })),
      },
      [P2]: { ...gs.players[P2], hand: [], deck: [] },
    },
  };

  // P1's turn, can't challenge (no standing cards), hand empty → pass
  gs = passTurn(gs);
  expect(gs.consecutivePasses).toBe(1);

  // Now P2's turn: P2 has hulk standing, P1 has no standing → P2 can't challenge
  // P2 hand is empty → pass
  gs = passTurn(gs);

  // deck-out: compare totals
  // P1 team: bear KO'd → total = 0
  // P2 team: hulk standing → total = 5+3+1 = 9
  expect(gs.phase).toBe('gameOver');
  expect(gs.winnerId).toBe(P2);
  expect(gs.winReason).toBe('deckOut');
});

// ---------------------------------------------------------------------------
// Test 5: Deck-out tie — both teams equal total → winnerId=null
// ---------------------------------------------------------------------------
test('Deck-out tie: both teams equal total → winnerId=null', () => {
  // Both players have equal team totals and cannot play
  let gs = makeGame(deckAlpha, deckBeta, 'bear', 'hulk');

  // Bear: P5,S2,W2 = 9, Hulk: P5,S3,W1 = 9 — different totals!
  // Need equal totals: use Kraken (P5,S2,W2) vs Bear (P5,S2,W2) both = 9
  let gs2 = setupGame(
    P1, P2,
    [getCard('bear'), getCard('fox'), getCard('owl'), getCard('wolf'), getCard('elephant'), getCard('nutmeg'), getCard('teddy-roosevelt'), getCard('swiss-army-knife')],
    [getCard('kraken'), getCard('jimi-hendrix'), getCard('ghost'), getCard('platinum'), getCard('muhammad-ali'), getCard('poltergeist'), getCard('hulk'), getCard('wise-elder')],
    P1, 0, { skipShuffle: true }
  );
  gs2 = submitOpeningPick(gs2, P1, 'bear');
  gs2 = submitOpeningPick(gs2, P2, 'kraken');

  // Make both unable to play: empty hands/decks, P1 standing KO'd OR both no standing vs each other
  // Actually: for passTurn both need hand empty AND can't challenge
  // If P1 has bear standing and P2 has kraken standing → both can challenge → can't pass
  // So: KO bear, leave kraken standing → P1 can pass (no standing cards), P2 can pass (P1 no standing)
  // But then totals: P1=0, P2=9 → not a tie
  // For a tie: both have standing cards with equal totals, but both have empty hands
  // P1: bear standing (9), P2: kraken standing (9) — equal! But can they challenge? Yes → can't pass
  // We need "no standing cards" for at least one player to block challenge
  // Alternative: KO both teams' cards, leaving only some
  // Bear(9) KO'd for P1, Kraken(9) for P2 → both KO'd → both totals = 0 → tie

  gs2 = {
    ...gs2,
    players: {
      ...gs2.players,
      [P1]: {
        ...gs2.players[P1],
        hand: [],
        deck: [],
        team: gs2.players[P1].team.map((cip) => ({ ...cip, knockedOut: true })),
      },
      [P2]: {
        ...gs2.players[P2],
        hand: [],
        deck: [],
        team: gs2.players[P2].team.map((cip) => ({ ...cip, knockedOut: true })),
      },
    },
  };

  gs2 = passTurn(gs2);
  expect(gs2.consecutivePasses).toBe(1);
  gs2 = passTurn(gs2);

  expect(gs2.phase).toBe('gameOver');
  expect(gs2.winnerId).toBeNull();
  expect(gs2.winReason).toBe('deckOut');
});
