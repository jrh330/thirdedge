'use strict';

const { BOND_BONUS, RALLY_BONUS } = require('./constants');

/**
 * Returns true if cardA and cardB can bond:
 * - Same trait, OR
 * - Either card has the Everyman ability
 */
function canBond(cardA, cardB) {
  if (cardA.trait === cardB.trait) return true;
  if (cardA.ability === 'Everyman' || cardB.ability === 'Everyman') return true;
  return false;
}

/**
 * Recompute bonds for an array of CardInPlay objects.
 * - Resets all bondPartnerId to null
 * - Only pairs STANDING (knockedOut===false) cards
 * - Sorts by recruitOrder ascending (oldest first)
 * - Greedy: for each unbonded card, find first later unbonded card that canBond → pair them
 * - Returns a NEW array (no mutation)
 */
function recomputeBonds(teamCards) {
  // Start with all bonds cleared
  let cards = teamCards.map((cip) => ({ ...cip, bondPartnerId: null }));

  // Only consider standing cards
  const standing = cards
    .filter((cip) => !cip.knockedOut)
    .sort((a, b) => a.recruitOrder - b.recruitOrder);

  const bonded = new Set();

  for (let i = 0; i < standing.length; i++) {
    const cipA = standing[i];
    if (bonded.has(cipA.card.id)) continue;

    for (let j = i + 1; j < standing.length; j++) {
      const cipB = standing[j];
      if (bonded.has(cipB.card.id)) continue;

      if (canBond(cipA.card, cipB.card)) {
        bonded.add(cipA.card.id);
        bonded.add(cipB.card.id);
        // Set bond partner IDs in the cards array
        cards = cards.map((cip) => {
          if (cip.card.id === cipA.card.id) {
            return { ...cip, bondPartnerId: cipB.card.id };
          }
          if (cip.card.id === cipB.card.id) {
            return { ...cip, bondPartnerId: cipA.card.id };
          }
          return cip;
        });
        break;
      }
    }
  }

  return cards;
}

/**
 * Get the effective value of a stat for a CardInPlay.
 * base + (bonded ? BOND_BONUS : 0) + rallyBonus
 */
function getEffectiveStat(cardInPlay, stat) {
  const base = cardInPlay.card[stat];
  const bondBonus = cardInPlay.bondPartnerId ? BOND_BONUS : 0;
  const rally = cardInPlay.rallyBonus || 0;
  return base + bondBonus + rally;
}

/**
 * Get the team total: sum of all 3 effective stats for all standing (not KO'd) cards.
 */
function getTeamTotal(teamCards) {
  return teamCards
    .filter((cip) => !cip.knockedOut)
    .reduce((sum, cip) => {
      return (
        sum +
        getEffectiveStat(cip, 'power') +
        getEffectiveStat(cip, 'speed') +
        getEffectiveStat(cip, 'wits')
      );
    }, 0);
}

module.exports = { canBond, recomputeBonds, getEffectiveStat, getTeamTotal };
