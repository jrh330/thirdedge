"use strict";
const {
  STAT_BUDGET, STAT_MIN, STAT_MAX, LEGAL_SHAPES,
  DECK_SIZE, SEVEN_ALLOWANCE, FAMILY_MAX,
  RULE_SET, CREW_MIN, CREW_MAX,
  FAMILIES,
} = require("./constants");

// ── Card validation ──────────────────────────────────────────────────────────

function isLegalShape(power, speed, wits) {
  const sorted = [power, speed, wits].slice().sort((a, b) => b - a);
  return LEGAL_SHAPES.some(s => s[0] === sorted[0] && s[1] === sorted[1] && s[2] === sorted[2]);
}

function validateCard(card) {
  const errors = [];
  const { power, speed, wits, family } = card;
  if (power + speed + wits !== STAT_BUDGET)
    errors.push(`stats sum to ${power + speed + wits}, expected ${STAT_BUDGET}`);
  for (const [k, v] of [["power", power], ["speed", speed], ["wits", wits]]) {
    if (v < STAT_MIN || v > STAT_MAX)
      errors.push(`${k} ${v} outside [${STAT_MIN}, ${STAT_MAX}]`);
  }
  if (!isLegalShape(power, speed, wits))
    errors.push(`[${[power, speed, wits].sort((a, b) => b - a).join("/")}] is not one of the 8 legal shapes`);
  if (!FAMILIES.includes(family))
    errors.push(`family "${family}" is not one of: ${FAMILIES.join(", ")}`);
  return errors;
}

// ── Deck validation ──────────────────────────────────────────────────────────

/**
 * Validate a deck (array of card objects).
 * @param {object[]} cards
 * @param {string}   ruleSet  "FAMILY_WHEEL" | "CREW"
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateDeck(cards, ruleSet = RULE_SET.FAMILY_WHEEL) {
  const errors = [];

  if (cards.length !== DECK_SIZE)
    errors.push(`deck has ${cards.length} cards, expected ${DECK_SIZE}`);

  const sevens = cards.filter(c => c.carriesSeven).length;
  if (sevens > SEVEN_ALLOWANCE)
    errors.push(`deck carries ${sevens} sevens, max is ${SEVEN_ALLOWANCE}`);

  if (ruleSet === RULE_SET.FAMILY_WHEEL) {
    // At most FAMILY_MAX cards of any one family
    const familyCount = {};
    for (const c of cards) familyCount[c.family] = (familyCount[c.family] || 0) + 1;
    for (const [family, n] of Object.entries(familyCount)) {
      if (n > FAMILY_MAX)
        errors.push(`too many ${family} cards (${n}, max ${FAMILY_MAX})`);
    }
  }

  if (ruleSet === RULE_SET.CREW) {
    const familyCount = {};
    for (const c of cards) familyCount[c.family] = (familyCount[c.family] || 0) + 1;

    const dominant = Object.entries(familyCount).filter(
      ([, n]) => n >= CREW_MIN && n <= CREW_MAX
    );
    if (dominant.length === 0)
      errors.push(`CREW rule: no family appears between ${CREW_MIN} and ${CREW_MAX} times`);

    for (const [family, n] of Object.entries(familyCount)) {
      if (n > CREW_MAX)
        errors.push(`CREW rule: ${family} appears ${n} times (max ${CREW_MAX})`);
    }
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { isLegalShape, validateCard, validateDeck };
