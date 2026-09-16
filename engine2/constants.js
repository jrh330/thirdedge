"use strict";

// ── Stat budget ──────────────────────────────────────────────────────────────
const STAT_BUDGET = 12;
const STAT_MIN    = 1;
const STAT_MAX    = 7;

// Each of the eight legal shapes as a sorted triple [high, mid, low]
const LEGAL_SHAPES = [
  [7, 4, 1],
  [7, 3, 2],
  [6, 5, 1],
  [6, 4, 2],
  [6, 3, 3],
  [5, 5, 2],
  [5, 4, 3],
  [4, 4, 4],
];

// ── Collection ───────────────────────────────────────────────────────────────
const SEVEN_ALLOWANCE = 3;   // max cards carrying a 7 in the active 12 (deck rule)
const FAMILY_MAX      = 6;   // max cards of one family in the active 12
const COLLECTION_MAX  = 20;
const ACTIVE_SIZE     = 12;
const INACTIVE_MAX    = 8;

// ── Deck / hand ──────────────────────────────────────────────────────────────
const DECK_SIZE  = 12;
const HAND_SIZE  = 4;

// ── Match ────────────────────────────────────────────────────────────────────
const ROUND_POINTS = 3;
const STAKE_CAP    = 3;
const MATCH_ROUNDS = 3;

// ── Turn clock ───────────────────────────────────────────────────────────────
const TURN_CLOCK_MS = 20000;

// ── Rule sets ────────────────────────────────────────────────────────────────
const RULE_SET = {
  FAMILY_WHEEL: "FAMILY_WHEEL",
  CREW:         "CREW",
};

// Bond bonus — +1 after sim showed +2 makes bond-denied state win 95% of turns
const BOND_VALUE = {
  FAMILY_WHEEL: 1,
  CREW:         1,
};

// CREW deck composition
const CREW_MIN = 5;
const CREW_MAX = 7;

// ── Collection management ────────────────────────────────────────────────────
const SAVED_DECKS_MAX      = 5;
const DELETE_COOLDOWN_MS   = 300_000;

// ── Families (replaces Traits) ───────────────────────────────────────────────
// Cards carry card.family directly — no trait→family lookup needed.
const FAMILIES = ["Vita", "Terra", "Arte"];

// The blocking wheel: key's family blocks value's family.
// Vita beats Arte · Arte beats Terra · Terra beats Vita  (never mutual)
const BLOCKS = {
  Vita:  "Arte",
  Arte:  "Terra",
  Terra: "Vita",
};

// ── Stats ────────────────────────────────────────────────────────────────────
const STATS = ["power", "speed", "wits"];

module.exports = {
  STAT_BUDGET,
  STAT_MIN,
  STAT_MAX,
  LEGAL_SHAPES,
  SEVEN_ALLOWANCE,
  FAMILY_MAX,
  COLLECTION_MAX,
  ACTIVE_SIZE,
  INACTIVE_MAX,
  DECK_SIZE,
  HAND_SIZE,
  ROUND_POINTS,
  STAKE_CAP,
  MATCH_ROUNDS,
  TURN_CLOCK_MS,
  RULE_SET,
  BOND_VALUE,
  CREW_MIN,
  CREW_MAX,
  SAVED_DECKS_MAX,
  DELETE_COOLDOWN_MS,
  FAMILIES,
  BLOCKS,
  STATS,
};
