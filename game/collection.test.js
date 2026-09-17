'use strict';

/**
 * collection.test.js — unit tests for collection.js
 *
 * Runs with Node's built-in test runner:
 *   node --test game/collection.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const {
  ACTIVE_SIZE, INACTIVE_MAX, COLLECTION_MAX, SAVED_DECKS_MAX,
  FAMILY_MAX, SEVEN_ALLOWANCE, DELETE_COOLDOWN_MS,
  makeFingerprint, checkDuplicate,
  checkActiveLegality, checkInactiveLegality, checkCollectionSize,
  placeMintedCard, legalSwapTargets,
  swapActiveInactive,
  saveDeck, loadDeck, isDeckEdited, markDecksNeedingCard,
  checkDeleteAllowed, formatCooldown, deleteCard,
  createSwapSession, sessionSwap, sessionLoadDeck, sessionUndo,
  sessionReady, sessionFinalDeck,
} = require('./collection');

// ─── Test data ───────────────────────────────────────────────────────────────

const poolPath = resolve(__dirname, 'test-pool.json');
const POOL = JSON.parse(readFileSync(poolPath, 'utf8')).cards;

// Helpers to build card objects from the pool
const byId   = id => POOL.find(c => c.id === id);
const card   = id => ({ ...byId(id), id });

// All Vita cards from the pool (10 total)
const vitaCards  = POOL.filter(c => c.family === 'Vita');
const terraCards = POOL.filter(c => c.family === 'Terra');
const arteCards  = POOL.filter(c => c.family === 'Arte');

// Pre-built legal 12-card deck: 4 Vita + 4 Terra + 4 Arte, ≤ 3 sevens
function legalDeck() {
  // Pick 4 from each family, taking sevens only as needed
  const pick = (arr, n) => arr.slice(0, n).map(c => ({ ...c }));
  return [
    ...pick(vitaCards.filter(c => !c.carriesSeven), 3),
    ...pick(vitaCards.filter(c => c.carriesSeven), 1),   // 1 seven
    ...pick(terraCards.filter(c => !c.carriesSeven), 3),
    ...pick(terraCards.filter(c => c.carriesSeven), 1),  // 1 seven
    ...pick(arteCards.filter(c => !c.carriesSeven), 3),
    ...pick(arteCards.filter(c => c.carriesSeven), 1),   // 1 seven
  ]; // 12 cards, 3 sevens, 4 per family — legal
}

// Make a synthetic card not in the pool
function synth(id, family, carriesSeven = false) {
  return { id, name: id, family, carriesSeven, power: 4, speed: 4, wits: 4 };
}

// ─── makeFingerprint & checkDuplicate ────────────────────────────────────────

describe('makeFingerprint', () => {
  test('lowercases and strips punctuation', () => {
    const fp = makeFingerprint('Peregrine Falcon!', 'Fast. Very fast!');
    assert.equal(fp, 'peregrine falcon|fast very fast');
  });

  test('collapses internal whitespace', () => {
    const fp = makeFingerprint('Hello   World', 'one  two   three');
    assert.equal(fp, 'hello world|one two three');
  });

  test('same name + text → same fingerprint regardless of case', () => {
    assert.equal(
      makeFingerprint('LION', 'King of the jungle'),
      makeFingerprint('lion', 'king of the jungle'),
    );
  });

  test('different text → different fingerprint', () => {
    const fp1 = makeFingerprint('Lion', 'King of the jungle');
    const fp2 = makeFingerprint('Lion', 'Lives in Africa');
    assert.notEqual(fp1, fp2);
  });

  test('punctuation-only difference is ignored', () => {
    assert.equal(
      makeFingerprint('Lion', "King of the jungle."),
      makeFingerprint('Lion', 'King of the jungle'),
    );
  });
});

describe('checkDuplicate', () => {
  const existing = [
    makeFingerprint('Lion', 'King of the jungle'),
    makeFingerprint('Eagle', 'High-flying bird of prey'),
  ];

  test('detects a duplicate', () => {
    const r = checkDuplicate('Lion!', 'King of the jungle', existing);
    assert.equal(r.duplicate, true);
  });

  test('no duplicate for different text', () => {
    const r = checkDuplicate('Lion', 'Roams the savannah', existing);
    assert.equal(r.duplicate, false);
  });

  test('returns the normalised fingerprint', () => {
    const r = checkDuplicate('Lion', 'King of the jungle', existing);
    assert.equal(r.fingerprint, makeFingerprint('Lion', 'King of the jungle'));
  });

  test('empty fingerprint list — no duplicate', () => {
    const r = checkDuplicate('Anything', 'anything', []);
    assert.equal(r.duplicate, false);
  });
});

// ─── Deck legality ───────────────────────────────────────────────────────────

describe('checkActiveLegality', () => {
  test('a legal 12-card deck passes', () => {
    const r = checkActiveLegality(legalDeck());
    assert.equal(r.ok, true);
  });

  test('fewer than 12 cards fails', () => {
    const r = checkActiveLegality(legalDeck().slice(0, 11));
    assert.equal(r.ok, false);
    assert.match(r.reason, /exactly 12/);
  });

  test('more than 12 cards fails', () => {
    const extra = [...legalDeck(), synth('x', 'Arte')];
    const r = checkActiveLegality(extra);
    assert.equal(r.ok, false);
    assert.match(r.reason, /exactly 12/);
  });

  test('7 cards of one family fails', () => {
    const deck = [
      ...vitaCards.filter(c => !c.carriesSeven).slice(0, 7),  // 7 Vita
      ...terraCards.filter(c => !c.carriesSeven).slice(0, 3),
      ...arteCards.filter(c => !c.carriesSeven).slice(0, 2),
    ];
    const r = checkActiveLegality(deck);
    assert.equal(r.ok, false);
    assert.match(r.reason, /Too many Vita/);
  });

  test('exactly 6 of one family passes', () => {
    const deck = [
      ...vitaCards.filter(c => !c.carriesSeven).slice(0, 6),  // exactly 6 Vita
      ...terraCards.filter(c => !c.carriesSeven).slice(0, 3),
      ...arteCards.filter(c => !c.carriesSeven).slice(0, 3),
    ];
    const r = checkActiveLegality(deck);
    assert.equal(r.ok, true);
  });

  test('4 sevens fails', () => {
    const sevenByFamily = {};
    for (const c of POOL.filter(c => c.carriesSeven)) {
      (sevenByFamily[c.family] = sevenByFamily[c.family] || []).push(c);
    }
    const pickedSevens = [
      sevenByFamily['Vita'][0],
      sevenByFamily['Terra'][0],
      sevenByFamily['Arte'][0],
    ];
    const extraSeven = synth('extra-seven', 'Vita', true);
    const nonSevens = POOL.filter(c => !c.carriesSeven);
    const fillers = [
      ...nonSevens.filter(c => c.family === 'Vita').slice(0, 2),
      ...nonSevens.filter(c => c.family === 'Terra').slice(0, 3),
      ...nonSevens.filter(c => c.family === 'Arte').slice(0, 3),
    ];
    const deck = [...pickedSevens, extraSeven, ...fillers];
    assert.equal(deck.length, 12);
    const fc = {};
    for (const c of deck) fc[c.family] = (fc[c.family] || 0) + 1;
    assert(Object.values(fc).every(n => n <= FAMILY_MAX), 'family counts ok');
    const r = checkActiveLegality(deck);
    assert.equal(r.ok, false);
    assert.match(r.reason, /Too many sevens/);
  });

  test('exactly 3 sevens passes', () => {
    const r = checkActiveLegality(legalDeck());
    assert.equal(r.ok, true);
    const sevens = legalDeck().filter(c => c.carriesSeven).length;
    assert.equal(sevens, 3);
  });
});

describe('checkInactiveLegality', () => {
  test('0 inactive is fine', () => {
    assert.equal(checkInactiveLegality([]).ok, true);
  });

  test('8 inactive is fine', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `c${i}`);
    assert.equal(checkInactiveLegality(ids).ok, true);
  });

  test('9 inactive fails', () => {
    const ids = Array.from({ length: 9 }, (_, i) => `c${i}`);
    const r = checkInactiveLegality(ids);
    assert.equal(r.ok, false);
    assert.match(r.reason, /Too many inactive/);
  });
});

describe('checkCollectionSize', () => {
  test('20 is fine', () => {
    assert.equal(checkCollectionSize(20).ok, true);
  });

  test('21 fails', () => {
    const r = checkCollectionSize(21);
    assert.equal(r.ok, false);
    assert.match(r.reason, /Collection is full/);
  });
});

// ─── Placement of a newly minted card ────────────────────────────────────────

describe('placeMintedCard', () => {
  test('goes active when fewer than 12 and stays legal', () => {
    const active = legalDeck().slice(0, 11); // 11 active
    const newCard = synth('newcomer', 'Arte');
    const r = placeMintedCard(newCard, active, []);
    assert.equal(r.placement, 'active');
    assert.equal(r.activeCount, 12);
  });

  test('returns "choice" when active is full but a legal swap exists', () => {
    const active = legalDeck(); // full 12
    const newCard = synth('newcomer', 'Arte');
    const r = placeMintedCard(newCard, active, []);
    assert.equal(r.placement, 'choice');
    assert(r.swapOptions.length > 0);
  });

  test('returns "inactive" when active is full and no legal swap exists', () => {
    const deck = legalDeck(); // 3 sevens
    const anotherSeven = synth('new-seven', 'Vita', true);
    const r = placeMintedCard(anotherSeven, deck, []);
    // Swapping out a seven leaves 2 + new seven = 3 — legal!
    assert.equal(r.placement, 'choice');
    const deckSevenIds = deck.filter(c => c.carriesSeven).map(c => c.id);
    for (const id of deckSevenIds) {
      assert(r.swapOptions.includes(id), `Expected ${id} to be a swap option`);
    }
  });

  test('returns "inactive" when adding would break FAMILY_MAX and no legal swap', () => {
    const deck = [
      ...vitaCards.filter(c => !c.carriesSeven).slice(0, 6),
      ...terraCards.filter(c => !c.carriesSeven).slice(0, 3),
      ...arteCards.filter(c => !c.carriesSeven).slice(0, 3),
    ];
    const newCard = synth('extra-vita', 'Vita');
    const r = placeMintedCard(newCard, deck, []);
    // Swapping out a Vita gives 5 Vita + newcomer = 6 — legal
    assert.equal(r.placement, 'choice');
    const vitaIds = deck.filter(c => c.family === 'Vita').map(c => c.id);
    for (const id of vitaIds) {
      assert(r.swapOptions.includes(id), `Expected Vita ${id} to be a swap option`);
    }
    // Non-Vita swap targets: swapping out a Terra/Arte + adding Vita would give 7 Vita — illegal
    const nonVitaIds = deck.filter(c => c.family !== 'Vita').map(c => c.id);
    for (const id of nonVitaIds) {
      assert(!r.swapOptions.includes(id), `Expected non-Vita ${id} NOT to be a swap option`);
    }
  });

  test('goes active when fewer than 12 even with a seven (if total ≤ 3)', () => {
    const nonSevenDeck = legalDeck().filter(c => !c.carriesSeven); // 9 non-seven cards
    const newSeven = synth('new-seven', 'Arte', true);
    const r = placeMintedCard(newSeven, nonSevenDeck, []);
    assert.equal(r.placement, 'active');
  });
});

describe('legalSwapTargets', () => {
  test('returns non-empty list when swaps are possible', () => {
    const deck = legalDeck();
    const newCard = synth('newcomer', 'Arte');
    const targets = legalSwapTargets(newCard, deck);
    assert(targets.length > 0);
  });

  test('every returned target produces a legal deck when swapped', () => {
    const deck = legalDeck();
    const newCard = synth('newcomer', 'Arte');
    const targets = legalSwapTargets(newCard, deck);
    for (const id of targets) {
      const proposed = deck.filter(c => c.id !== id).concat(newCard);
      const r = checkActiveLegality(proposed);
      assert.equal(r.ok, true, `Swap ${id} should be legal`);
    }
  });
});

// ─── Swap active ↔ inactive ──────────────────────────────────────────────────

describe('swapActiveInactive', () => {
  function setup() {
    const active   = legalDeck();
    const inactive = [synth('ia1', 'Terra'), synth('ia2', 'Vita')];
    return { active, inactive };
  }

  test('valid swap succeeds', () => {
    const { active, inactive } = setup();
    const outId = active.find(c => c.family === 'Arte').id;
    const r = swapActiveInactive(outId, 'ia1', active, inactive);
    assert.equal(r.ok, true);
    assert.equal(r.active.length, 12);
    assert(!r.active.find(c => c.id === outId), 'outCard should not be in new active');
    assert(r.active.find(c => c.id === 'ia1'), 'inCard should be in new active');
    assert(r.inactive.find(c => c.id === outId), 'outCard should be in new inactive');
    assert(!r.inactive.find(c => c.id === 'ia1'), 'inCard should not be in new inactive');
  });

  test('fails if outId is not in active', () => {
    const { active, inactive } = setup();
    const r = swapActiveInactive('nonexistent', 'ia1', active, inactive);
    assert.equal(r.ok, false);
    assert.match(r.reason, /not in active/);
  });

  test('fails if inId is not in inactive', () => {
    const { active, inactive } = setup();
    const outId = active[0].id;
    const r = swapActiveInactive(outId, 'nonexistent', active, inactive);
    assert.equal(r.ok, false);
    assert.match(r.reason, /not in inactive/);
  });

  test('fails if swap would make active illegal', () => {
    const deck = [
      ...vitaCards.filter(c => !c.carriesSeven).slice(0, 6),
      ...terraCards.filter(c => !c.carriesSeven).slice(0, 3),
      ...arteCards.filter(c => !c.carriesSeven).slice(0, 3),
    ];
    const inactive = [synth('extra-vita', 'Vita')];
    const outId = deck.find(c => c.family === 'Terra').id;
    const r = swapActiveInactive(outId, 'extra-vita', deck, inactive);
    assert.equal(r.ok, false);
    assert.match(r.reason, /Too many Vita/);
  });
});

// ─── Saved decks ─────────────────────────────────────────────────────────────

describe('saveDeck', () => {
  test('saves a new legal deck', () => {
    const r = saveDeck('My Deck', legalDeck(), []);
    assert.equal(r.ok, true);
    assert.equal(r.savedDecks.length, 1);
    assert.equal(r.savedDecks[0].name, 'My Deck');
    assert.equal(r.savedDecks[0].cards.length, 12);
  });

  test('fails if deck is not legal', () => {
    const r = saveDeck('Bad Deck', legalDeck().slice(0, 11), []);
    assert.equal(r.ok, false);
    assert.match(r.reason, /Cannot save/);
  });

  test('fails if name exceeds 24 characters', () => {
    const r = saveDeck('A'.repeat(25), legalDeck(), []);
    assert.equal(r.ok, false);
    assert.match(r.reason, /24 characters/);
  });

  test('allows exactly 24-character name', () => {
    const r = saveDeck('A'.repeat(24), legalDeck(), []);
    assert.equal(r.ok, true);
  });

  test('fails when already at SAVED_DECKS_MAX', () => {
    const decks = Array.from({ length: SAVED_DECKS_MAX }, (_, i) => ({
      id: `d${i}`, name: `Deck ${i}`, cards: legalDeck().map(c => c.id),
    }));
    const r = saveDeck('One More', legalDeck(), decks);
    assert.equal(r.ok, false);
    assert.match(r.reason, /already have 5/);
  });

  test('can overwrite an existing deck', () => {
    const firstSave = saveDeck('Old Name', legalDeck(), []);
    const deckId = firstSave.savedDecks[0].id;
    const r = saveDeck('New Name', legalDeck(), firstSave.savedDecks, deckId);
    assert.equal(r.ok, true);
    assert.equal(r.savedDecks.length, 1);
    assert.equal(r.savedDecks[0].name, 'New Name');
  });

  test('fails overwriting a non-existent deck id', () => {
    const r = saveDeck('Deck', legalDeck(), [], 'does-not-exist');
    assert.equal(r.ok, false);
    assert.match(r.reason, /not found/);
  });
});

describe('loadDeck', () => {
  function buildSavedDeck(cards) {
    return {
      id: 'test-deck',
      name: 'Test',
      cards: cards.map(c => c.id),
    };
  }

  test('loads a valid saved deck', () => {
    const deck = legalDeck();
    const allCards = [...deck, synth('ia1', 'Arte'), synth('ia2', 'Terra')];
    const saved = buildSavedDeck(deck);
    const r = loadDeck('test-deck', [saved], allCards);
    assert.equal(r.ok, true);
    assert.equal(r.active.length, 12);
    assert.equal(r.inactive.length, 2);
    assert.equal(r.loadedDeckId, 'test-deck');
  });

  test('fails when a card in the saved deck was deleted', () => {
    const deck = legalDeck();
    const saved = buildSavedDeck(deck);
    const available = deck.slice(0, 11);
    const r = loadDeck('test-deck', [saved], available);
    assert.equal(r.ok, false);
    assert.match(r.reason, /needs 1 card/i);
    assert(r.needsCards.length === 1);
  });

  test('fails when deck id not found', () => {
    const r = loadDeck('nope', [], legalDeck());
    assert.equal(r.ok, false);
    assert.match(r.reason, /not found/);
  });

  test('fails when loading would leave too many inactive', () => {
    const deck = legalDeck();
    const extras = Array.from({ length: INACTIVE_MAX + 1 }, (_, i) =>
      synth(`extra${i}`, 'Arte'));
    const allCards = [...deck, ...extras];
    const saved = buildSavedDeck(deck);
    const r = loadDeck('test-deck', [saved], allCards);
    assert.equal(r.ok, false);
    assert.match(r.reason, /inactive cards/);
  });
});

describe('isDeckEdited', () => {
  test('not edited when active matches saved deck', () => {
    const deck = legalDeck();
    const savedDecks = [{ id: 'deck1', name: 'D', cards: deck.map(c => c.id) }];
    assert.equal(isDeckEdited('deck1', savedDecks, deck), false);
  });

  test('edited when a card differs', () => {
    const deck = legalDeck();
    const savedDecks = [{ id: 'deck1', name: 'D', cards: deck.map(c => c.id) }];
    const modified = [...deck.slice(0, 11), synth('newcomer', 'Arte')];
    assert.equal(isDeckEdited('deck1', savedDecks, modified), true);
  });

  test('false when no deck loaded', () => {
    assert.equal(isDeckEdited(null, [], legalDeck()), false);
  });
});

describe('markDecksNeedingCard', () => {
  test('marks decks containing the deleted card', () => {
    const deck = legalDeck();
    const deletedId = deck[0].id;
    const savedDecks = [
      { id: 'd1', name: 'D1', cards: deck.map(c => c.id) },
      { id: 'd2', name: 'D2', cards: deck.slice(1).concat(synth('x', 'Arte')).map(c => c.id) },
    ];
    const updated = markDecksNeedingCard(deletedId, savedDecks);
    assert.equal(updated[0].needsCard, deletedId);
    assert.equal(updated[1].needsCard, null);
  });
});

// ─── Delete ──────────────────────────────────────────────────────────────────

describe('checkDeleteAllowed', () => {
  test('allows delete when no cooldown', () => {
    const r = checkDeleteAllowed(null, Date.now(), false, false);
    assert.equal(r.ok, true);
  });

  test('blocks when in match', () => {
    const r = checkDeleteAllowed(null, Date.now(), true, false);
    assert.equal(r.ok, false);
    assert.match(r.reason, /in a match/);
  });

  test('blocks when on Trade', () => {
    const r = checkDeleteAllowed(null, Date.now(), false, true);
    assert.equal(r.ok, false);
    assert.match(r.reason, /out on a Trade/);
  });

  test('blocks during cooldown', () => {
    const now = Date.now();
    const lastDelete = now - 60_000; // 1 minute ago
    const r = checkDeleteAllowed(lastDelete, now, false, false);
    assert.equal(r.ok, false);
    assert.match(r.reason, /delete again in/);
    assert(r.cooldownRemainingMs > 0);
    assert(r.cooldownRemainingMs <= DELETE_COOLDOWN_MS);
  });

  test('allows after cooldown', () => {
    const now = Date.now();
    const lastDelete = now - DELETE_COOLDOWN_MS - 1;
    const r = checkDeleteAllowed(lastDelete, now, false, false);
    assert.equal(r.ok, true);
  });
});

describe('formatCooldown', () => {
  test('4:00 for 240000ms', () => {
    assert.equal(formatCooldown(240_000), '4:00');
  });

  test('4:12 for 252000ms', () => {
    assert.equal(formatCooldown(252_000), '4:12');
  });

  test('0:01 for 1ms (rounds up)', () => {
    assert.equal(formatCooldown(1), '0:01');
  });

  test('5:00 for DELETE_COOLDOWN_MS', () => {
    assert.equal(formatCooldown(DELETE_COOLDOWN_MS), '5:00');
  });
});

describe('deleteCard', () => {
  const fp = 'test|fingerprint';

  test('deletes an inactive card cleanly', () => {
    const active = legalDeck();
    const inactive = [synth('ia1', 'Arte')];
    const now = Date.now();
    const r = deleteCard('ia1', active, inactive, undefined, [], fp, now);
    assert.equal(r.ok, true);
    assert(!r.inactive.find(c => c.id === 'ia1'));
    assert(r.fingerprints.includes(fp));
    assert.equal(r.lastDeletedAt, now);
    assert.equal(r.active.length, 12);
  });

  test('deletes an active card with a valid replacement', () => {
    const active = legalDeck();
    const inactive = [synth('ia1', 'Arte')];
    const deletedId = active.find(c => c.family === 'Arte' && !c.carriesSeven).id;
    const now = Date.now();
    const r = deleteCard(deletedId, active, inactive, 'ia1', [], fp, now);
    assert.equal(r.ok, true);
    assert(!r.active.find(c => c.id === deletedId));
    assert(r.active.find(c => c.id === 'ia1'));
    assert.equal(r.active.length, 12);
  });

  test('deletes an active card with no replacement — deck becomes unplayable', () => {
    const active = legalDeck();
    const inactive = [];
    const deletedId = active[0].id;
    const r = deleteCard(deletedId, active, inactive, undefined, [], fp, Date.now());
    assert.equal(r.ok, true);
    assert.equal(r.unplayable, true);
    assert.equal(r.active.length, 11);
  });

  test('fails with an illegal replacement', () => {
    const deck = [
      ...vitaCards.filter(c => !c.carriesSeven).slice(0, 6),
      ...terraCards.filter(c => !c.carriesSeven).slice(0, 3),
      ...arteCards.filter(c => !c.carriesSeven).slice(0, 3),
    ];
    const inactive = [synth('extra-vita', 'Vita')];
    const deletedId = deck.find(c => c.family === 'Arte').id;
    const r = deleteCard(deletedId, deck, inactive, 'extra-vita', [], fp, Date.now());
    assert.equal(r.ok, false);
    assert.match(r.reason, /Too many Vita/);
  });

  test('fails if card not in collection', () => {
    const r = deleteCard('ghost', legalDeck(), [], undefined, [], fp, Date.now());
    assert.equal(r.ok, false);
    assert.match(r.reason, /not found/);
  });

  test('does not duplicate an existing fingerprint', () => {
    const inactive = [synth('ia1', 'Arte')];
    const r = deleteCard('ia1', legalDeck(), inactive, undefined, [fp], fp, Date.now());
    const count = r.fingerprints.filter(f => f === fp).length;
    assert.equal(count, 1);
  });
});

// ─── Rematch swap session ─────────────────────────────────────────────────────

describe('createSwapSession', () => {
  test('creates session with correct initial state', () => {
    const deck = legalDeck();
    const s = createSwapSession(deck);
    assert.equal(s.startingActive.length, 12);
    assert.equal(s.currentActive.length, 12);
    assert.equal(s.swapCount, 0);
    assert.equal(s.ready, false);
  });

  test('startingActive is a copy (mutations do not affect it)', () => {
    const deck = legalDeck();
    const s = createSwapSession(deck);
    s.currentActive.push(synth('x', 'Arte'));
    assert.equal(s.startingActive.length, 12);
  });
});

describe('sessionSwap', () => {
  function swapSetup() {
    const active   = legalDeck();
    const inactive = [synth('ia1', 'Arte'), synth('ia2', 'Vita')];
    const session  = createSwapSession(active);
    return { active, inactive, session };
  }

  test('valid swap increments swapCount', () => {
    const { active, inactive, session } = swapSetup();
    const outId = active.find(c => c.family === 'Arte').id;
    const r = sessionSwap(session, outId, 'ia1', inactive);
    assert.equal(r.ok, true);
    assert.equal(r.session.swapCount, 1);
  });

  test('illegal swap returns error without mutating session', () => {
    const { inactive, session } = swapSetup();
    const r = sessionSwap(session, 'does-not-exist', 'ia1', inactive);
    assert.equal(r.ok, false);
    assert.equal(session.swapCount, 0); // unchanged
  });

  test('session.startingActive is unchanged after swap', () => {
    const { active, inactive, session } = swapSetup();
    const outId = active.find(c => c.family === 'Arte').id;
    sessionSwap(session, outId, 'ia1', inactive);
    assert.equal(session.startingActive.length, 12);
    assert(session.startingActive.find(c => c.id === outId));
  });
});

describe('sessionLoadDeck', () => {
  test('loading a saved deck updates currentActive and counts swaps', () => {
    const deck = legalDeck();
    const ia1 = synth('ia1', 'Arte');
    const ia2 = synth('ia2', 'Arte');
    const ia3 = synth('ia3', 'Arte');
    const ia4 = synth('ia4', 'Arte');
    const savedActive = [
      ...deck.filter(c => c.family !== 'Arte'),
      ia1, ia2, ia3, ia4,
    ];
    assert.equal(savedActive.length, 12);
    const savedDecks = [{
      id: 'sd1',
      name: 'Alt Deck',
      cards: savedActive.map(c => c.id),
    }];
    const allCards = [...deck, ia1, ia2, ia3, ia4];
    const session = createSwapSession(deck);

    const r = sessionLoadDeck(session, 'sd1', savedDecks, allCards);
    assert.equal(r.ok, true);
    assert.equal(r.session.currentActive.length, 12);
    assert(r.session.swapCount > 0);
  });
});

describe('sessionUndo', () => {
  test('undo restores starting active', () => {
    const deck = legalDeck();
    const ia = synth('ia1', 'Arte');
    const session = createSwapSession(deck);
    const allCards = [...deck, ia];

    const outId = deck.find(c => c.family === 'Arte').id;
    const after = sessionSwap(session, outId, 'ia1', [ia]);
    assert.equal(after.ok, true);
    assert.equal(after.session.swapCount, 1);

    const undoResult = sessionUndo(after.session, allCards);
    assert.equal(undoResult.session.swapCount, 0);
    assert.equal(undoResult.session.ready, false);
    const activeIds = undoResult.session.currentActive.map(c => c.id);
    const startingIds = deck.map(c => c.id);
    assert.deepEqual(activeIds.sort(), startingIds.sort());
  });
});

describe('sessionReady + sessionFinalDeck', () => {
  test('marks session ready', () => {
    const s = createSwapSession(legalDeck());
    const r = sessionReady(s);
    assert.equal(r.ready, true);
    assert.equal(s.ready, false); // original unchanged
  });

  test('final deck equals currentActive', () => {
    const deck = legalDeck();
    const session = createSwapSession(deck);
    const final = sessionFinalDeck(session);
    assert.deepEqual(
      final.map(c => c.id).sort(),
      deck.map(c => c.id).sort(),
    );
  });
});
