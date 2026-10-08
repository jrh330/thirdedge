'use strict';

const { canBond, recomputeBonds, getEffectiveStat, getTeamTotal } = require('../bonds');
const { BOND_BONUS, RALLY_BONUS } = require('../constants');
const { getCard } = require('../fixtures');

// Helper: build a CardInPlay
function makeCIP(cardId, recruitOrder, overrides = {}) {
  return {
    card: getCard(cardId),
    abilityUsed: false,
    abilityRevealed: false,
    bondPartnerId: null,
    rallyBonus: 0,
    knockedOut: false,
    recruitOrder,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: Two Beasts on same team bond (Bear + Wolf)
// ---------------------------------------------------------------------------
test('Two Beasts on same team bond (Bear + Wolf)', () => {
  const bear = makeCIP('bear', 0);
  const wolf = makeCIP('wolf', 1);

  expect(canBond(bear.card, wolf.card)).toBe(true);

  const team = recomputeBonds([bear, wolf]);
  const bearCIP = team.find((c) => c.card.id === 'bear');
  const wolfCIP = team.find((c) => c.card.id === 'wolf');

  expect(bearCIP.bondPartnerId).toBe('wolf');
  expect(wolfCIP.bondPartnerId).toBe('bear');
});

// ---------------------------------------------------------------------------
// Test 2: Different traits don't bond (Bear + Hulk)
// ---------------------------------------------------------------------------
test('Different traits do not bond (Bear + Hulk)', () => {
  const bear = makeCIP('bear', 0);
  const hulk = makeCIP('hulk', 1);

  expect(canBond(bear.card, hulk.card)).toBe(false);

  const team = recomputeBonds([bear, hulk]);
  expect(team.find((c) => c.card.id === 'bear').bondPartnerId).toBeNull();
  expect(team.find((c) => c.card.id === 'hulk').bondPartnerId).toBeNull();
});

// ---------------------------------------------------------------------------
// Test 3: Everyman bonds with any trait
// ---------------------------------------------------------------------------
test('Everyman (Swiss Army Knife) bonds with Beast (Bear)', () => {
  const sak = makeCIP('swiss-army-knife', 0);
  const bear = makeCIP('bear', 1);

  expect(canBond(sak.card, bear.card)).toBe(true);

  const team = recomputeBonds([sak, bear]);
  expect(team.find((c) => c.card.id === 'swiss-army-knife').bondPartnerId).toBe('bear');
  expect(team.find((c) => c.card.id === 'bear').bondPartnerId).toBe('swiss-army-knife');
});

test('Everyman (Swiss Army Knife) bonds with Spirit (Ghost)', () => {
  const sak = makeCIP('swiss-army-knife', 0);
  const ghost = makeCIP('ghost', 1);

  expect(canBond(sak.card, ghost.card)).toBe(true);

  const team = recomputeBonds([sak, ghost]);
  expect(team.find((c) => c.card.id === 'swiss-army-knife').bondPartnerId).toBe('ghost');
  expect(team.find((c) => c.card.id === 'ghost').bondPartnerId).toBe('swiss-army-knife');
});

// ---------------------------------------------------------------------------
// Test 4: Three same-trait Beasts: only first two pair; third is unbonded
// ---------------------------------------------------------------------------
test('Three same-trait Beasts: only first two pair; third is unbonded', () => {
  const bear = makeCIP('bear', 0);      // Beast
  const wolf = makeCIP('wolf', 1);      // Beast
  const fox = makeCIP('fox', 2);        // Beast

  const team = recomputeBonds([bear, wolf, fox]);

  const bearCIP = team.find((c) => c.card.id === 'bear');
  const wolfCIP = team.find((c) => c.card.id === 'wolf');
  const foxCIP = team.find((c) => c.card.id === 'fox');

  // First two bond
  expect(bearCIP.bondPartnerId).toBe('wolf');
  expect(wolfCIP.bondPartnerId).toBe('bear');
  // Third is unbonded
  expect(foxCIP.bondPartnerId).toBeNull();
});

// ---------------------------------------------------------------------------
// Test 5: Bond breaks when partner KO'd
// ---------------------------------------------------------------------------
test('Bond breaks when partner is KO\'d', () => {
  // Start with two bonded Beasts, then KO one and recompute
  const bear = makeCIP('bear', 0);
  const wolf = makeCIP('wolf', 1);

  const teamBonded = recomputeBonds([bear, wolf]);
  expect(teamBonded.find((c) => c.card.id === 'bear').bondPartnerId).toBe('wolf');

  // KO the wolf
  const teamWithKO = teamBonded.map((cip) =>
    cip.card.id === 'wolf' ? { ...cip, knockedOut: true } : cip
  );

  const teamRecomputed = recomputeBonds(teamWithKO);
  expect(teamRecomputed.find((c) => c.card.id === 'bear').bondPartnerId).toBeNull();
  expect(teamRecomputed.find((c) => c.card.id === 'wolf').bondPartnerId).toBeNull();
});

// ---------------------------------------------------------------------------
// Test 6: getEffectiveStat includes bond bonus
// ---------------------------------------------------------------------------
test('getEffectiveStat includes bond bonus when bonded', () => {
  const bear = makeCIP('bear', 0);
  const wolf = makeCIP('wolf', 1);
  const team = recomputeBonds([bear, wolf]);

  const bearCIP = team.find((c) => c.card.id === 'bear');
  // Bear power=5, bonded → 5 + BOND_BONUS
  expect(getEffectiveStat(bearCIP, 'power')).toBe(5 + BOND_BONUS);
});

test('getEffectiveStat has no bond bonus when unbonded', () => {
  const bear = makeCIP('bear', 0);
  // Not bonded
  expect(getEffectiveStat(bear, 'power')).toBe(5);
});

test('getEffectiveStat includes rallyBonus', () => {
  const bear = makeCIP('bear', 0, { rallyBonus: RALLY_BONUS });
  expect(getEffectiveStat(bear, 'power')).toBe(5 + RALLY_BONUS);
});

// ---------------------------------------------------------------------------
// Test 7: getTeamTotal sums correctly
// ---------------------------------------------------------------------------
test('getTeamTotal sums all effective stats of standing cards', () => {
  const bear = makeCIP('bear', 0);  // p=5, s=2, w=2 → 9
  const wolf = makeCIP('wolf', 1);  // p=3, s=4, w=2 → 9

  const team = recomputeBonds([bear, wolf]);
  // Both bonded → each gets +1 on all 3 stats
  // Bear total: 6+3+3 = 12, Wolf total: 4+5+3 = 12
  // Grand total: 24
  const total = getTeamTotal(team);
  expect(total).toBe((5 + 1) + (2 + 1) + (2 + 1) + (3 + 1) + (4 + 1) + (2 + 1));
  // = 6 + 3 + 3 + 4 + 5 + 3 = 24
  expect(total).toBe(24);
});

test('getTeamTotal excludes KO\'d cards', () => {
  const bear = makeCIP('bear', 0);
  const wolf = makeCIP('wolf', 1, { knockedOut: true });

  const team = recomputeBonds([bear, wolf]);
  // Only bear stands; wolf is KO'd; bear is unbonded
  const total = getTeamTotal(team);
  expect(total).toBe(5 + 2 + 2); // Bear raw stats, no bond bonus
  expect(total).toBe(9);
});
