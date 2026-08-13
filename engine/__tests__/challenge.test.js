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
  fireDefenderSmash,
} = require('../game');
const { getCard } = require('../fixtures');
const { GUARD_BONUS } = require('../constants');

// Test decks (no shuffle)
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

const P1 = 'player1';
const P2 = 'player2';

/**
 * Helper: set up a game and get both players past the opening phase
 * with their opening cards on the team (no rally), then recruit more if needed.
 * Returns a game in 'turn' phase with P1 as active.
 */
function setupTurnGame(p1OpenCard = 'bear', p2OpenCard = 'hulk') {
  let gs = setupGame(P1, P2, deckAlpha, deckBeta, P1, 0, { skipShuffle: true });
  gs = submitOpeningPick(gs, P1, p1OpenCard);
  gs = submitOpeningPick(gs, P2, p2OpenCard);
  // After both picks, we should be in 'turn' phase (Bear and Hulk have Smash, not Rally)
  return gs;
}

// ---------------------------------------------------------------------------
// Test 1: Full challenge sequence transitions
// ---------------------------------------------------------------------------
test('Full challenge sequence: initiate → submitAttackStat → submitGuardStat → step transitions', () => {
  let gs = setupTurnGame('bear', 'hulk');

  // Recruit a second card to have something to challenge with
  // P1's turn - they have bear on team already (from opening), bear attacks hulk
  gs = initiateChallenge(gs, 'bear', 'hulk');
  expect(gs.phase).toBe('challenge');
  expect(gs.challenge.step).toBe('picking');

  // Submit guard first
  gs = submitGuardStat(gs, 'speed');
  expect(gs.challenge.step).toBe('picking'); // still picking, waiting for attack stat
  expect(gs.challenge.guardedStat).toBe('speed');

  // Submit attack stat → should move to defenderWindow
  gs = submitAttackStat(gs, 'power');
  expect(gs.challenge.step).toBe('defenderWindow');
  expect(gs.challenge.attackerStat).toBe('power');
});

test('Attack stat submitted first, then guard → step moves to defenderWindow', () => {
  let gs = setupTurnGame('bear', 'hulk');
  gs = initiateChallenge(gs, 'bear', 'hulk');

  gs = submitAttackStat(gs, 'power');
  expect(gs.challenge.step).toBe('picking'); // still waiting for guard

  gs = submitGuardStat(gs, 'speed');
  expect(gs.challenge.step).toBe('defenderWindow');
});

// ---------------------------------------------------------------------------
// Test 2: Attacker wins clearly
// ---------------------------------------------------------------------------
test('Attacker wins clearly: Bear P5 attacks Owl P1, picks power, no guard on power', () => {
  // Setup with bear vs owl
  let gs = setupGame(P1, P2,
    [getCard('bear'), getCard('fox'), getCard('wolf'), getCard('elephant'), getCard('nutmeg'), getCard('owl'), getCard('teddy-roosevelt'), getCard('swiss-army-knife')],
    [getCard('owl'), getCard('jimi-hendrix'), getCard('ghost'), getCard('platinum'), getCard('muhammad-ali'), getCard('poltergeist'), getCard('kraken'), getCard('hulk')],
    P1, 0, { skipShuffle: true }
  );

  gs = submitOpeningPick(gs, P1, 'bear');
  gs = submitOpeningPick(gs, P2, 'owl');
  // Both have Smash/Trick — neither Rally, so go straight to turn
  expect(gs.phase).toBe('turn');

  // P1 challenges: Bear (power=5) attacks Owl (power=1)
  gs = initiateChallenge(gs, 'bear', 'owl');
  gs = submitAttackStat(gs, 'power');
  gs = submitGuardStat(gs, 'speed'); // guard on speed, not power
  expect(gs.challenge.step).toBe('defenderWindow');

  gs = declineDefenderAbility(gs); // Owl has Trick but we skip
  expect(gs.challenge.step).toBe('attackerWindow');

  gs = declineAttackerAbility(gs); // Bear has Smash but we skip
  // Bear power=5, no smash, no bond
  // Owl power=1, guard on speed (not power), no bond
  // 5 > 1 → Owl KO'd, Owl has Dodge ability (speed=3 < 4) → cannot dodge
  // Owl speed=3 so NO dodge window
  expect(gs.phase).toBe('turn'); // challenge resolved
  expect(gs.challenge).toBeNull();

  // Check owl is KO'd
  const owlCIP = gs.players[P2].team.find((c) => c.card.id === 'owl');
  expect(owlCIP.knockedOut).toBe(true);
});

// ---------------------------------------------------------------------------
// Test 3: Defender wins via guard
// ---------------------------------------------------------------------------
test('Defender wins via guard: attacker picks power, defender guards power', () => {
  // Bear P5 attacks Hulk P5 with power — with guard, Hulk effective = 5+3=8 > Bear 5
  let gs = setupTurnGame('bear', 'hulk');
  gs = initiateChallenge(gs, 'bear', 'hulk');

  // Both pick power
  gs = submitAttackStat(gs, 'power');
  gs = submitGuardStat(gs, 'power'); // defender guards the attacked stat
  expect(gs.challenge.step).toBe('defenderWindow');

  gs = declineDefenderAbility(gs);
  gs = declineAttackerAbility(gs);

  // Bear eff power = 5, Hulk eff power = 5 + GUARD_BONUS(3) = 8
  // Hulk wins → Bear KO'd, Bear has Smash not Dodge → no dodge window
  expect(gs.phase).toBe('turn');
  const bearCIP = gs.players[P1].team.find((c) => c.card.id === 'bear');
  expect(bearCIP.knockedOut).toBe(true);

  const hulkCIP = gs.players[P2].team.find((c) => c.card.id === 'hulk');
  expect(hulkCIP.knockedOut).toBe(false);
});

// ---------------------------------------------------------------------------
// Test 4: Stand-off — exactly equal effective stats → no KO
// ---------------------------------------------------------------------------
test('Stand-off: exactly equal effective stats → no KO', () => {
  // Use two cards with same power stat for a tie
  // Bear P5 vs Hulk P5, no guard on power, no smash → 5 vs 5 = tie
  let gs = setupTurnGame('bear', 'hulk');
  gs = initiateChallenge(gs, 'bear', 'hulk');

  gs = submitAttackStat(gs, 'power');
  gs = submitGuardStat(gs, 'speed'); // guard on wrong stat

  gs = declineDefenderAbility(gs);
  gs = declineAttackerAbility(gs);

  // 5 vs 5 = standoff → neither KO'd
  expect(gs.phase).toBe('turn');
  const bearCIP = gs.players[P1].team.find((c) => c.card.id === 'bear');
  const hulkCIP = gs.players[P2].team.find((c) => c.card.id === 'hulk');
  expect(bearCIP.knockedOut).toBe(false);
  expect(hulkCIP.knockedOut).toBe(false);
});

// ---------------------------------------------------------------------------
// Test 5: Guard on wrong stat doesn't help
// ---------------------------------------------------------------------------
test('Guard on wrong stat does not apply guard bonus', () => {
  // Bear P5 attacks with power, Hulk guards speed → Hulk gets no guard bonus on power
  // Bear power=5, Hulk power=5, guard on speed → 5 vs 5 = tie
  let gs = setupTurnGame('bear', 'hulk');
  gs = initiateChallenge(gs, 'bear', 'hulk');

  gs = submitAttackStat(gs, 'power');
  gs = submitGuardStat(gs, 'speed'); // wrong guard stat

  gs = declineDefenderAbility(gs);
  gs = declineAttackerAbility(gs);

  // No guard bonus applies → 5 vs 5 → standoff
  expect(gs.phase).toBe('turn');
  const bearCIP = gs.players[P1].team.find((c) => c.card.id === 'bear');
  expect(bearCIP.knockedOut).toBe(false);
});

// ---------------------------------------------------------------------------
// Test 6: consecutivePasses resets after challenge
// ---------------------------------------------------------------------------
test('consecutivePasses resets to 0 after a challenge resolves', () => {
  let gs = setupTurnGame('bear', 'hulk');

  // Manually set consecutivePasses > 0
  gs = { ...gs, consecutivePasses: 1 };

  gs = initiateChallenge(gs, 'bear', 'hulk');
  gs = submitAttackStat(gs, 'power');
  gs = submitGuardStat(gs, 'speed');
  gs = declineDefenderAbility(gs);
  gs = declineAttackerAbility(gs);

  expect(gs.consecutivePasses).toBe(0);
});
