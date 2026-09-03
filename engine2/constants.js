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
const SEVEN_ALLOWANCE = 3;  // cards per collection that may carry a 7

// ── Deck / hand ──────────────────────────────────────────────────────────────
const DECK_SIZE  = 12;
const HAND_SIZE  = 4;

// ── Match ────────────────────────────────────────────────────────────────────
const ROUND_POINTS = 3;     // points to win a round
const STAKE_CAP    = 3;     // max stake carry
const MATCH_ROUNDS = 3;     // best-of

// ── Turn clock ───────────────────────────────────────────────────────────────
const TURN_CLOCK_MS = 20000;

// ── Rule sets ────────────────────────────────────────────────────────────────
const RULE_SET = {
  FAMILY_WHEEL: "FAMILY_WHEEL",
  CREW:         "CREW",
};

// Bond bonus per rule set (the single most sensitive knob)
const BOND_VALUE = {
  FAMILY_WHEEL: 2,
  CREW:         1,
};

// CREW deck composition
const CREW_MIN = 5;
const CREW_MAX = 7;

// ── Traits & families ────────────────────────────────────────────────────────
const TRAITS = ["Beast", "Titan", "Machine", "Icon", "Element", "Spirit"];

const FAMILY_OF = {
  Beast:   "Living",
  Titan:   "Living",
  Machine: "Made",
  Icon:    "Made",
  Element: "Raw",
  Spirit:  "Raw",
};

// The blocking wheel: key's family blocks value's family
// Living → Made → Raw → Living (never mutual)
const BLOCKS = {
  Living: "Made",
  Made:   "Raw",
  Raw:    "Living",
};

// ── Stats ────────────────────────────────────────────────────────────────────
const STATS = ["power", "speed", "wits"];

module.exports = {
  STAT_BUDGET,
  STAT_MIN,
  STAT_MAX,
  LEGAL_SHAPES,
  SEVEN_ALLOWANCE,
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
  TRAITS,
  FAMILY_OF,
  BLOCKS,
  STATS,
};
