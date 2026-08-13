'use strict';

const {
  STAT_BUDGET,
  STAT_MIN,
  STAT_MAX,
  DECK_SIZE,
  MAX_FIVE_CARDS,
  TRAITS,
  ABILITIES,
} = require('./constants');

/**
 * Validate a single card.
 * Throws descriptive Error on failure.
 */
function validateCard(card) {
  if (!card || typeof card !== 'object') {
    throw new Error('Card must be an object');
  }

  // Stats present
  const { power, speed, wits, trait, ability } = card;
  for (const [key, val] of [['power', power], ['speed', speed], ['wits', wits]]) {
    if (typeof val !== 'number' || !Number.isInteger(val)) {
      throw new Error(`Card stat '${key}' must be an integer, got: ${val}`);
    }
    if (val < STAT_MIN || val > STAT_MAX) {
      throw new Error(
        `Card stat '${key}' must be between ${STAT_MIN} and ${STAT_MAX}, got: ${val}`
      );
    }
  }

  // Stat budget
  const total = power + speed + wits;
  if (total !== STAT_BUDGET) {
    throw new Error(
      `Card stats must sum to ${STAT_BUDGET}, got: ${total} (power=${power}, speed=${speed}, wits=${wits})`
    );
  }

  // Valid trait
  if (!TRAITS.includes(trait)) {
    throw new Error(`Invalid trait '${trait}'. Must be one of: ${TRAITS.join(', ')}`);
  }

  // Valid ability
  if (!ABILITIES.includes(ability)) {
    throw new Error(
      `Invalid ability '${ability}'. Must be one of: ${ABILITIES.join(', ')}`
    );
  }

  // Ability gates
  switch (ability) {
    case 'Smash':
      if (power < 4) {
        throw new Error(
          `Smash requires power >= 4, card has power=${power}`
        );
      }
      break;
    case 'Dodge':
      if (speed < 4) {
        throw new Error(
          `Dodge requires speed >= 4, card has speed=${speed}`
        );
      }
      break;
    case 'Trick':
      if (wits < 4) {
        throw new Error(
          `Trick requires wits >= 4, card has wits=${wits}`
        );
      }
      break;
    case 'Rally':
      if (power === 5 || speed === 5 || wits === 5) {
        throw new Error(
          `Rally requires no stat === 5, card has power=${power}, speed=${speed}, wits=${wits}`
        );
      }
      break;
    case 'Everyman':
      if (power >= 4 || speed >= 4 || wits >= 4) {
        throw new Error(
          `Everyman requires no stat >= 4, card has power=${power}, speed=${speed}, wits=${wits}`
        );
      }
      break;
    default:
      break;
  }
}

/**
 * Validate a deck of cards.
 * Throws descriptive Error on failure.
 */
function validateDeck(cards) {
  if (!Array.isArray(cards)) {
    throw new Error('Deck must be an array');
  }
  if (cards.length !== DECK_SIZE) {
    throw new Error(`Deck must contain exactly ${DECK_SIZE} cards, got: ${cards.length}`);
  }

  // Validate each card individually
  for (let i = 0; i < cards.length; i++) {
    try {
      validateCard(cards[i]);
    } catch (err) {
      throw new Error(`Invalid card at index ${i}: ${err.message}`);
    }
  }

  // MAX_FIVE_CARDS constraint
  const fiveStatCount = cards.filter(
    (c) => c.power === 5 || c.speed === 5 || c.wits === 5
  ).length;
  if (fiveStatCount > MAX_FIVE_CARDS) {
    throw new Error(
      `Deck may contain at most ${MAX_FIVE_CARDS} cards with a stat of 5, found: ${fiveStatCount}`
    );
  }
}

module.exports = { validateCard, validateDeck };
