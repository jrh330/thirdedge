'use strict';

/**
 * collection.js — Allagaroo collection logic
 *
 * Pure functions, no I/O, no UI, no network. All inputs are plain objects;
 * all outputs are plain objects or primitives.
 *
 * Constants and interfaces reflect game-spec-v2.md §2–§3 (2026-09-15 revision).
 *
 * @module collection
 */

// ─── Constants (spec §2) ────────────────────────────────────────────────────

const COLLECTION_MAX        = 20;
const ACTIVE_SIZE           = 12;   // = DECK_SIZE
const INACTIVE_MAX          = 8;
const SAVED_DECKS_MAX       = 5;
const FAMILY_MAX            = 6;
const SEVEN_ALLOWANCE       = 3;    // max cards carrying a 7 in the active 12
const DELETE_COOLDOWN_MS    = 300_000;  // 5 minutes
const REMATCH_SWAP_CLOCK_MS = 60_000;

// ─── Duplicate fingerprint ──────────────────────────────────────────────────

/**
 * Produce the normalised fingerprint for a card.
 * "Same" means same name + same text, ignoring case, extra whitespace, and punctuation.
 * The picture is NOT part of the fingerprint (spec §4.1 / minting-flow.md §Decided 4).
 *
 * @param {string} name
 * @param {string} text  ("about it" field)
 * @returns {string}
 */
function makeFingerprint(name, text) {
  const norm = s =>
    s.toLowerCase()
     .replace(/[^\w\s]/g, '')   // strip punctuation
     .replace(/\s+/g, ' ')      // collapse whitespace
     .trim();
  return `${norm(name)}|${norm(text)}`;
}

/**
 * Check whether a (name, text) pair matches an existing fingerprint.
 * Checks against both current cards and deleted-card fingerprints.
 *
 * @param {string}   name
 * @param {string}   text
 * @param {string[]} existingFingerprints  — from both live and deleted cards
 * @returns {{ duplicate: boolean, fingerprint: string }}
 */
function checkDuplicate(name, text, existingFingerprints) {
  const fp = makeFingerprint(name, text);
  return { duplicate: existingFingerprints.includes(fp), fingerprint: fp };
}

// ─── Deck legality ──────────────────────────────────────────────────────────

/**
 * Check whether a list of card objects is a legal active deck.
 * Rules (applied to the active 12 only, spec §5.1):
 *   - Exactly ACTIVE_SIZE (12) cards
 *   - At most FAMILY_MAX (6) of any one family
 *   - At most SEVEN_ALLOWANCE (3) cards carrying a 7
 *
 * @param {object[]} cards  — each must have { family: string, carriesSeven: boolean }
 * @returns {{ ok: boolean, reason?: string }}
 */
function checkActiveLegality(cards) {
  if (cards.length !== ACTIVE_SIZE) {
    return {
      ok: false,
      reason: `Active deck must have exactly ${ACTIVE_SIZE} cards (has ${cards.length})`,
    };
  }

  const familyCounts = {};
  let sevenCount = 0;
  for (const c of cards) {
    familyCounts[c.family] = (familyCounts[c.family] ?? 0) + 1;
    if (c.carriesSeven) sevenCount++;
  }

  for (const [family, count] of Object.entries(familyCounts)) {
    if (count > FAMILY_MAX) {
      return {
        ok: false,
        reason: `Too many ${family} cards (${count} of ${FAMILY_MAX} max)`,
      };
    }
  }

  if (sevenCount > SEVEN_ALLOWANCE) {
    return {
      ok: false,
      reason: `Too many sevens (${sevenCount} of ${SEVEN_ALLOWANCE} max)`,
    };
  }

  return { ok: true };
}

/**
 * Check whether a collection's inactive list is within bounds.
 * No family or seven rules apply to inactive cards.
 *
 * @param {string[]} inactive  — array of card ids
 * @returns {{ ok: boolean, reason?: string }}
 */
function checkInactiveLegality(inactive) {
  if (inactive.length > INACTIVE_MAX) {
    return {
      ok: false,
      reason: `Too many inactive cards (${inactive.length} of ${INACTIVE_MAX} max)`,
    };
  }
  return { ok: true };
}

/**
 * Check whether a collection's total size is within bounds.
 *
 * @param {number} total  — active.length + inactive.length
 * @returns {{ ok: boolean, reason?: string }}
 */
function checkCollectionSize(total) {
  if (total > COLLECTION_MAX) {
    return {
      ok: false,
      reason: `Collection is full (${total} of ${COLLECTION_MAX} max)`,
    };
  }
  return { ok: true };
}

/**
 * Check only the composition rules (family max, seven allowance) against a
 * candidate list that need not be exactly ACTIVE_SIZE long.
 * Used when placing a card into a not-yet-full active list.
 *
 * @param {object[]} cards
 * @returns {{ ok: boolean, reason?: string }}
 */
function checkCompositionOnly(cards) {
  const familyCounts = {};
  let sevenCount = 0;
  for (const c of cards) {
    familyCounts[c.family] = (familyCounts[c.family] ?? 0) + 1;
    if (c.carriesSeven) sevenCount++;
  }
  for (const [family, count] of Object.entries(familyCounts)) {
    if (count > FAMILY_MAX) {
      return { ok: false, reason: `Too many ${family} cards (${count} of ${FAMILY_MAX} max)` };
    }
  }
  if (sevenCount > SEVEN_ALLOWANCE) {
    return { ok: false, reason: `Too many sevens (${sevenCount} of ${SEVEN_ALLOWANCE} max)` };
  }
  return { ok: true };
}

// ─── Placement of a newly minted card ───────────────────────────────────────

/**
 * Decide where a newly minted card goes immediately after Reveal.
 *
 * @param {object}   newCard         — { id, family, carriesSeven, … }
 * @param {object[]} activeCards     — current active list (card objects, length 0–12)
 * @param {string[]} inactiveIds     — current inactive list (card ids)
 * @returns {object}
 */
function placeMintedCard(newCard, activeCards, inactiveIds) {
  const newCount = activeCards.length + 1;

  // Case 1: active has room and adding the card satisfies composition rules
  if (activeCards.length < ACTIVE_SIZE) {
    const result = checkCompositionOnly([...activeCards, newCard]);
    if (result.ok) {
      return { placement: 'active', activeCount: newCount };
    }
    // Room but composition would break — falls through to choice/inactive
  }

  // Active is full or the card can't go straight in. Build the list of legal swap options.
  const swapOptions = legalSwapTargets(newCard, activeCards);

  const reasons = [];
  if (activeCards.length >= ACTIVE_SIZE) reasons.push('Your 12 active cards are full');
  if (activeCards.filter(c => c.carriesSeven).length >= SEVEN_ALLOWANCE && newCard.carriesSeven) {
    reasons.push('already have 3 sevens');
  }
  const familyCount = activeCards.filter(c => c.family === newCard.family).length;
  if (familyCount >= FAMILY_MAX) {
    reasons.push(`already have 6 ${newCard.family} cards`);
  }

  const reason = reasons.join(' and ');

  if (swapOptions.length === 0) {
    return {
      placement: 'inactive',
      reason: reason || 'No legal swap available',
      inactiveCount: inactiveIds.length + 1,
    };
  }

  return {
    placement: 'choice',
    reason,
    swapOptions,
    inactiveCount: inactiveIds.length + 1,
  };
}

/**
 * Return the list of active card ids whose removal would make the active list
 * legal after the incoming card is added.
 *
 * @param {object}   incomingCard
 * @param {object[]} activeCards
 * @returns {string[]}
 */
function legalSwapTargets(incomingCard, activeCards) {
  return activeCards
    .filter(existing => {
      const proposed = activeCards
        .filter(c => c.id !== existing.id)
        .concat(incomingCard);
      return checkActiveLegality(proposed).ok;
    })
    .map(c => c.id);
}

// ─── Swap active ↔ inactive ─────────────────────────────────────────────────

/**
 * Swap an active card out and an inactive card in.
 *
 * @param {string}   outId
 * @param {string}   inId
 * @param {object[]} activeCards
 * @param {object[]} inactiveCards
 * @returns {{ ok: boolean, reason?: string, active?: object[], inactive?: object[] }}
 */
function swapActiveInactive(outId, inId, activeCards, inactiveCards) {
  const outCard  = activeCards.find(c => c.id === outId);
  const inCard   = inactiveCards.find(c => c.id === inId);

  if (!outCard) return { ok: false, reason: `Card "${outId}" is not in active` };
  if (!inCard)  return { ok: false, reason: `Card "${inId}" is not in inactive` };

  const newActive   = activeCards.filter(c => c.id !== outId).concat(inCard);
  const newInactive = inactiveCards.filter(c => c.id !== inId).concat(outCard);

  const legality = checkActiveLegality(newActive);
  if (!legality.ok) return { ok: false, reason: legality.reason };

  return { ok: true, active: newActive, inactive: newInactive };
}

// ─── Saved decks ────────────────────────────────────────────────────────────

/**
 * Save the current active list as a new named deck, or overwrite an existing one.
 *
 * @param {string}   name
 * @param {object[]} activeCards
 * @param {object[]} savedDecks
 * @param {string}   [overwriteId]
 * @returns {{ ok: boolean, reason?: string, savedDecks?: object[] }}
 */
function saveDeck(name, activeCards, savedDecks, overwriteId) {
  const legality = checkActiveLegality(activeCards);
  if (!legality.ok) return { ok: false, reason: `Cannot save: ${legality.reason}` };

  if (name.length > 24) {
    return { ok: false, reason: 'Deck name must be 24 characters or fewer' };
  }

  if (overwriteId) {
    const idx = savedDecks.findIndex(d => d.id === overwriteId);
    if (idx === -1) return { ok: false, reason: `Deck "${overwriteId}" not found` };
    const updated = savedDecks.map((d, i) =>
      i === idx ? { ...d, name, cards: activeCards.map(c => c.id) } : d
    );
    return { ok: true, savedDecks: updated };
  }

  if (savedDecks.length >= SAVED_DECKS_MAX) {
    return {
      ok: false,
      reason: `You already have ${SAVED_DECKS_MAX} saved decks`,
    };
  }

  const newDeck = {
    id: `deck-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    cards: activeCards.map(c => c.id),
  };

  return { ok: true, savedDecks: [...savedDecks, newDeck] };
}

/**
 * Load a saved deck: make its 12 cards active, move everything else to inactive.
 *
 * @param {string}   deckId
 * @param {object[]} savedDecks
 * @param {object[]} allCards
 * @returns {{ ok: boolean, reason?: string, active?: object[], inactive?: object[], loadedDeckId?: string }}
 */
function loadDeck(deckId, savedDecks, allCards) {
  const deck = savedDecks.find(d => d.id === deckId);
  if (!deck) return { ok: false, reason: `Deck "${deckId}" not found` };

  const missingIds = deck.cards.filter(id => !allCards.find(c => c.id === id));
  if (missingIds.length > 0) {
    return {
      ok: false,
      reason: `Deck needs ${missingIds.length} card${missingIds.length > 1 ? 's' : ''} — pick a replacement`,
      needsCards: missingIds,
    };
  }

  const newActive   = deck.cards.map(id => allCards.find(c => c.id === id));
  const newInactive = allCards.filter(c => !deck.cards.includes(c.id));

  if (newInactive.length > INACTIVE_MAX) {
    return {
      ok: false,
      reason: `Loading this deck would leave ${newInactive.length} inactive cards (max ${INACTIVE_MAX})`,
    };
  }

  const legality = checkActiveLegality(newActive);
  if (!legality.ok) return { ok: false, reason: `Saved deck is no longer legal: ${legality.reason}` };

  return { ok: true, active: newActive, inactive: newInactive, loadedDeckId: deckId };
}

/**
 * Determine whether the loaded deck tab should show "edited".
 *
 * @param {string}   loadedDeckId
 * @param {object[]} savedDecks
 * @param {object[]} activeCards
 * @returns {boolean}
 */
function isDeckEdited(loadedDeckId, savedDecks, activeCards) {
  if (!loadedDeckId) return false;
  const deck = savedDecks.find(d => d.id === loadedDeckId);
  if (!deck) return false;
  if (deck.cards.length !== activeCards.length) return true;
  const activeIds = activeCards.map(c => c.id);
  return deck.cards.some((id, i) => id !== activeIds[i]) ||
    activeIds.some(id => !deck.cards.includes(id));
}

/**
 * Mark any saved decks that reference a deleted card as needing a replacement.
 *
 * @param {string}   deletedId
 * @param {object[]} savedDecks
 * @returns {object[]}
 */
function markDecksNeedingCard(deletedId, savedDecks) {
  return savedDecks.map(d => ({
    ...d,
    needsCard: d.cards.includes(deletedId) ? deletedId : (d.needsCard ?? null),
  }));
}

// ─── Delete ─────────────────────────────────────────────────────────────────

/**
 * Check whether a delete is allowed right now.
 *
 * @param {number|null} lastDeletedAt
 * @param {number}      now
 * @param {boolean}     inMatch
 * @param {boolean}     onTrade
 * @returns {{ ok: boolean, reason?: string, cooldownRemainingMs?: number }}
 */
function checkDeleteAllowed(lastDeletedAt, now, inMatch, onTrade) {
  if (inMatch)  return { ok: false, reason: 'Card is in a match in progress' };
  if (onTrade)  return { ok: false, reason: 'Card is out on a Trade' };

  if (lastDeletedAt != null) {
    const elapsed = now - lastDeletedAt;
    if (elapsed < DELETE_COOLDOWN_MS) {
      const remaining = DELETE_COOLDOWN_MS - elapsed;
      return {
        ok: false,
        reason: `You can delete again in ${formatCooldown(remaining)}`,
        cooldownRemainingMs: remaining,
      };
    }
  }

  return { ok: true };
}

/**
 * Format a cooldown duration into "M:SS".
 * @param {number} ms
 * @returns {string}
 */
function formatCooldown(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Perform a delete.
 *
 * @param {string}   deletedId
 * @param {object[]} activeCards
 * @param {object[]} inactiveCards
 * @param {string}   [replacementId]
 * @param {string[]} fingerprints
 * @param {string}   fingerprint
 * @param {number}   now
 * @returns {{ ok: boolean, reason?: string, active?: object[], inactive?: object[], fingerprints?: string[], lastDeletedAt?: number }}
 */
function deleteCard(
  deletedId,
  activeCards,
  inactiveCards,
  replacementId,
  fingerprints,
  fingerprint,
  now,
) {
  const isActive   = activeCards.some(c => c.id === deletedId);
  const isInactive = inactiveCards.some(c => c.id === deletedId);

  if (!isActive && !isInactive) {
    return { ok: false, reason: `Card "${deletedId}" not found in collection` };
  }

  const newFingerprints = fingerprints.includes(fingerprint)
    ? fingerprints
    : [...fingerprints, fingerprint];

  if (isInactive) {
    return {
      ok: true,
      active: activeCards,
      inactive: inactiveCards.filter(c => c.id !== deletedId),
      fingerprints: newFingerprints,
      lastDeletedAt: now,
    };
  }

  // Active card: need a replacement
  if (!replacementId) {
    // No inactive cards available — deck becomes unplayable
    const newActive = activeCards.filter(c => c.id !== deletedId);
    return {
      ok: true,
      active: newActive,
      inactive: inactiveCards,
      fingerprints: newFingerprints,
      lastDeletedAt: now,
      unplayable: true,
    };
  }

  const replacement = inactiveCards.find(c => c.id === replacementId);
  if (!replacement) {
    return { ok: false, reason: `Replacement card "${replacementId}" is not in inactive` };
  }

  const newActive   = activeCards.filter(c => c.id !== deletedId).concat(replacement);
  const newInactive = inactiveCards.filter(c => c.id !== replacementId);

  const legality = checkActiveLegality(newActive);
  if (!legality.ok) {
    return { ok: false, reason: `Replacement would make the deck illegal: ${legality.reason}` };
  }

  return {
    ok: true,
    active: newActive,
    inactive: newInactive,
    fingerprints: newFingerprints,
    lastDeletedAt: now,
  };
}

// ─── Rematch swap session ───────────────────────────────────────────────────

/**
 * Create a new rematch swap session for one player.
 *
 * @param {object[]} activeCards
 * @returns {{ startingActive: object[], currentActive: object[], swapCount: number, ready: boolean }}
 */
function createSwapSession(activeCards) {
  return {
    startingActive: [...activeCards],
    currentActive:  [...activeCards],
    swapCount: 0,
    ready: false,
  };
}

/**
 * Apply a single swap within a rematch swap session.
 *
 * @param {object}   session
 * @param {string}   outId
 * @param {string}   inId
 * @param {object[]} inactiveCards
 * @returns {{ ok: boolean, reason?: string, session?: object, inactive?: object[] }}
 */
function sessionSwap(session, outId, inId, inactiveCards) {
  const result = swapActiveInactive(outId, inId, session.currentActive, inactiveCards);
  if (!result.ok) return result;
  return {
    ok: true,
    session: {
      ...session,
      currentActive: result.active,
      swapCount: session.swapCount + 1,
    },
    inactive: result.inactive,
  };
}

/**
 * Load a saved deck within a rematch swap session (counts as multiple swaps).
 *
 * @param {object}   session
 * @param {string}   deckId
 * @param {object[]} savedDecks
 * @param {object[]} allCards
 * @returns {{ ok: boolean, reason?: string, session?: object, inactive?: object[] }}
 */
function sessionLoadDeck(session, deckId, savedDecks, allCards) {
  const result = loadDeck(deckId, savedDecks, allCards);
  if (!result.ok) return result;

  const swapCount = result.active.filter(
    c => !session.startingActive.find(s => s.id === c.id)
  ).length;

  return {
    ok: true,
    session: {
      ...session,
      currentActive: result.active,
      swapCount: session.swapCount + swapCount,
      loadedDeckId: deckId,
    },
    inactive: result.inactive,
  };
}

/**
 * Undo all swaps in a session, restoring the starting active list.
 *
 * @param {object}   session
 * @param {object[]} allCards
 * @returns {{ session: object, inactive: object[] }}
 */
function sessionUndo(session, allCards) {
  const startingIds = new Set(session.startingActive.map(c => c.id));
  const inactive = allCards.filter(c => !startingIds.has(c.id));
  return {
    session: {
      ...session,
      currentActive: [...session.startingActive],
      swapCount: 0,
      ready: false,
      loadedDeckId: undefined,
    },
    inactive,
  };
}

/**
 * Mark the player as ready to start the match.
 *
 * @param {object} session
 * @returns {object}
 */
function sessionReady(session) {
  return { ...session, ready: true };
}

/**
 * Return the final active deck from a completed swap session.
 *
 * @param {object} session
 * @returns {object[]}
 */
function sessionFinalDeck(session) {
  return session.currentActive;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  COLLECTION_MAX,
  ACTIVE_SIZE,
  INACTIVE_MAX,
  SAVED_DECKS_MAX,
  FAMILY_MAX,
  SEVEN_ALLOWANCE,
  DELETE_COOLDOWN_MS,
  REMATCH_SWAP_CLOCK_MS,
  makeFingerprint,
  checkDuplicate,
  checkActiveLegality,
  checkInactiveLegality,
  checkCollectionSize,
  placeMintedCard,
  legalSwapTargets,
  swapActiveInactive,
  saveDeck,
  loadDeck,
  isDeckEdited,
  markDecksNeedingCard,
  checkDeleteAllowed,
  formatCooldown,
  deleteCard,
  createSwapSession,
  sessionSwap,
  sessionLoadDeck,
  sessionUndo,
  sessionReady,
  sessionFinalDeck,
};
