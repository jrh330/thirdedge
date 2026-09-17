'use strict';

/**
 * minting.test.js — unit tests for minting.js
 *
 * Runs with Node's built-in test runner:
 *   node --test game/minting.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const {
  NAME_MAX, FLAVOR_MAX, STAT_BUDGET, MAX_LLM_TRIES,
  validateSubmission,
  validateLLMResponse,
  buildSealedResult,
  getCheckPayload,
  mintCard,
  runCheckStep,
  runMintStep,
  discardSealedResult,
} = require('./minting');

// ─── Test fixtures ────────────────────────────────────────────────────────────

const POOL = JSON.parse(
  readFileSync(resolve(__dirname, 'test-pool.json'), 'utf8'),
).cards;

const good = {
  name: 'Harbor Seal',
  flavorText: 'Playful, sleek, and social. Barks like a dog and sunbathes on docks.',
  imageRef: 'seal.jpg',
};

const goodLLM = {
  power: 2,
  speed: 6,
  wits: 4,
  family: 'Vita',
  kind: 'Marine mammal',
  readAs: 'a playful coastal seal',
  reasoning: 'Social and quick in water (Speed 6); no real fighting power (Power 2); curious and aware (Wits 4).',
  anchors: ['Fox', 'Nosebleed'],
};

// Helpers
const gate = { allowed: async () => ({ verdict: 'allowed' }) };
const llm  = { ok: async () => goodLLM };

function newPlayerState(overrides = {}) {
  return {
    collectionTotal: 10,
    fingerprints:    [],
    deletedFingerprints: [],
    deletedCardNames: {},
    fingerprintNames: {},
    ...overrides,
  };
}

// ─── validateSubmission ───────────────────────────────────────────────────────

describe('validateSubmission', () => {
  test('accepts a valid submission', () => {
    assert.equal(validateSubmission(good).ok, true);
  });

  test('rejects missing name', () => {
    const r = validateSubmission({ ...good, name: '' });
    assert.equal(r.ok, false);
    assert.match(r.reason, /Name/);
  });

  test('rejects whitespace-only name', () => {
    const r = validateSubmission({ ...good, name: '   ' });
    assert.equal(r.ok, false);
  });

  test(`rejects name over ${NAME_MAX} characters`, () => {
    const r = validateSubmission({ ...good, name: 'A'.repeat(NAME_MAX + 1) });
    assert.equal(r.ok, false);
    assert.match(r.reason, /28 characters/);
  });

  test(`accepts name at exactly ${NAME_MAX} characters`, () => {
    const r = validateSubmission({ ...good, name: 'A'.repeat(NAME_MAX) });
    assert.equal(r.ok, true);
  });

  test('rejects missing flavorText', () => {
    const r = validateSubmission({ ...good, flavorText: '' });
    assert.equal(r.ok, false);
    assert.match(r.reason, /text/i);
  });

  test(`rejects flavorText over ${FLAVOR_MAX} characters`, () => {
    const r = validateSubmission({ ...good, flavorText: 'x'.repeat(FLAVOR_MAX + 1) });
    assert.equal(r.ok, false);
    assert.match(r.reason, /160 characters/);
  });

  test(`accepts flavorText at exactly ${FLAVOR_MAX} characters`, () => {
    const r = validateSubmission({ ...good, flavorText: 'x'.repeat(FLAVOR_MAX) });
    assert.equal(r.ok, true);
  });
});

// ─── validateLLMResponse ──────────────────────────────────────────────────────

describe('validateLLMResponse', () => {
  test('accepts a valid response', () => {
    assert.equal(validateLLMResponse(goodLLM).ok, true);
  });

  test('rejects null', () => {
    assert.equal(validateLLMResponse(null).ok, false);
  });

  test('rejects non-object', () => {
    assert.equal(validateLLMResponse('string').ok, false);
  });

  test('rejects stat above 7', () => {
    const r = validateLLMResponse({ ...goodLLM, power: 8, speed: 2, wits: 2 });
    assert.equal(r.ok, false);
    assert.match(r.reason, /between 1 and 7/);
  });

  test('rejects stat below 1', () => {
    const r = validateLLMResponse({ ...goodLLM, power: 0, speed: 6, wits: 6 });
    assert.equal(r.ok, false);
    assert.match(r.reason, /between 1 and 7/);
  });

  test('rejects stats that do not sum to 12', () => {
    const r = validateLLMResponse({ ...goodLLM, power: 5, speed: 5, wits: 5 });
    assert.equal(r.ok, false);
    assert.match(r.reason, /total 12/);
  });

  test('rejects an illegal shape', () => {
    const r = validateLLMResponse({ ...goodLLM, power: 3, speed: 3, wits: 7 });
    // 3+3+7=13, not 12
    assert.equal(r.ok, false);
  });

  test('rejects invalid family', () => {
    const r = validateLLMResponse({ ...goodLLM, family: 'Bogus' });
    assert.equal(r.ok, false);
    assert.match(r.reason, /Vita, Terra or Arte/);
  });

  test('rejects missing kind', () => {
    const r = validateLLMResponse({ ...goodLLM, kind: '' });
    assert.equal(r.ok, false);
    assert.match(r.reason, /kind/);
  });

  test('rejects kind with more than 2 words', () => {
    const r = validateLLMResponse({ ...goodLLM, kind: 'Very Large Animal' });
    assert.equal(r.ok, false);
    assert.match(r.reason, /1–2 words/);
  });

  test('accepts kind with exactly 2 words', () => {
    const r = validateLLMResponse({ ...goodLLM, kind: 'Marine Mammal' });
    assert.equal(r.ok, true);
  });

  test('rejects missing readAs', () => {
    const r = validateLLMResponse({ ...goodLLM, readAs: '' });
    assert.equal(r.ok, false);
    assert.match(r.reason, /readAs/);
  });

  test('rejects readAs containing stat numbers', () => {
    const r = validateLLMResponse({ ...goodLLM, readAs: 'Power 7 beast' });
    assert.equal(r.ok, false);
    assert.match(r.reason, /stats/);
  });

  test('rejects readAs with a stat fraction (e.g. 7/4/1)', () => {
    const r = validateLLMResponse({ ...goodLLM, readAs: 'a 7/4/1 shaped predator' });
    assert.equal(r.ok, false);
    assert.match(r.reason, /stats/);
  });

  test('rejects missing reasoning', () => {
    const r = validateLLMResponse({ ...goodLLM, reasoning: '' });
    assert.equal(r.ok, false);
    assert.match(r.reason, /reasoning/);
  });

  test('rejects empty anchors array', () => {
    const r = validateLLMResponse({ ...goodLLM, anchors: [] });
    assert.equal(r.ok, false);
    assert.match(r.reason, /anchors/);
  });

  test('rejects non-array anchors', () => {
    const r = validateLLMResponse({ ...goodLLM, anchors: 'Cheetah' });
    assert.equal(r.ok, false);
    assert.match(r.reason, /anchors/);
  });

  // Verify all 8 legal shapes are accepted
  for (const shape of ['7/4/1','7/3/2','6/5/1','6/4/2','6/3/3','5/5/2','5/4/3','4/4/4']) {
    const [p, s, w] = shape.split('/').map(Number);
    test(`accepts legal shape ${shape}`, () => {
      const r = validateLLMResponse({ ...goodLLM, power: p, speed: s, wits: w });
      assert.equal(r.ok, true, r.reason);
    });
  }

  test('accepts a shape in non-descending order', () => {
    // 7/4/1 → submit as 1/4/7
    const r = validateLLMResponse({ ...goodLLM, power: 1, speed: 4, wits: 7 });
    assert.equal(r.ok, true);
  });
});

// ─── buildSealedResult / getCheckPayload ──────────────────────────────────────

describe('buildSealedResult', () => {
  const sealed = buildSealedResult('sub-001', good, goodLLM);

  test('includes submissionId', () => {
    assert.equal(sealed.submissionId, 'sub-001');
  });

  test('checkVisible has readAs, family, kind, reasoning, anchors', () => {
    assert.equal(sealed.checkVisible.readAs, goodLLM.readAs);
    assert.equal(sealed.checkVisible.family, goodLLM.family);
    assert.equal(sealed.checkVisible.kind, goodLLM.kind);
    assert.equal(sealed.checkVisible.reasoning, goodLLM.reasoning);
    assert.deepEqual(sealed.checkVisible.anchors, goodLLM.anchors);
  });

  test('checkVisible does NOT include stats', () => {
    assert(!('power'  in sealed.checkVisible), 'power should not be in checkVisible');
    assert(!('speed'  in sealed.checkVisible), 'speed should not be in checkVisible');
    assert(!('wits'   in sealed.checkVisible), 'wits should not be in checkVisible');
  });

  test('sealed contains full stats', () => {
    assert.equal(sealed.sealed.power, goodLLM.power);
    assert.equal(sealed.sealed.speed, goodLLM.speed);
    assert.equal(sealed.sealed.wits,  goodLLM.wits);
  });

  test('fingerprint is set', () => {
    assert(typeof sealed.fingerprint === 'string');
    assert(sealed.fingerprint.length > 0);
  });

  test('carriesSeven is derived correctly', () => {
    // goodLLM has max stat 6 — not a seven
    assert.equal(sealed.carriesSeven, false);
    const sevenLLM = { ...goodLLM, power: 7, speed: 4, wits: 1 };
    const s = buildSealedResult('x', good, sevenLLM);
    assert.equal(s.carriesSeven, true);
  });
});

describe('getCheckPayload', () => {
  test('returns only the safe check-visible fields', () => {
    const sealed = buildSealedResult('sub-001', good, goodLLM);
    const payload = getCheckPayload(sealed);
    assert.equal(payload.readAs, goodLLM.readAs);
    assert(!('power' in payload));
    assert(!('speed' in payload));
    assert(!('wits'  in payload));
  });
});

// ─── mintCard ─────────────────────────────────────────────────────────────────

describe('mintCard', () => {
  const sealed = buildSealedResult('sub-001', good, goodLLM);
  const card = mintCard(sealed, 'card-001', 'player-1', 'https://example.com/seal.jpg');

  test('card has all required spec §3 fields', () => {
    assert.equal(card.id, 'card-001');
    assert.equal(card.ownerId, 'player-1');
    assert.equal(card.name, good.name);
    assert.equal(card.imageUrl, 'https://example.com/seal.jpg');
    assert.equal(card.flavorText, good.flavorText);
    assert.equal(card.power, goodLLM.power);
    assert.equal(card.speed, goodLLM.speed);
    assert.equal(card.wits, goodLLM.wits);
    assert.equal(card.family, goodLLM.family);
    assert.equal(card.kind, goodLLM.kind);
    assert.equal(card.carriesSeven, false);
    assert.equal(card.aiReasoning, goodLLM.reasoning);
    assert.deepEqual(card.aiAnchors, goodLLM.anchors);
    assert(typeof card.fingerprint === 'string');
  });

  test('demotedFrom is NOT present', () => {
    assert(!('demotedFrom' in card), 'demotedFrom must not exist (retired 2026-09-15)');
  });

  test('stats sum to STAT_BUDGET', () => {
    assert.equal(card.power + card.speed + card.wits, STAT_BUDGET);
  });

  test('name and flavorText are trimmed', () => {
    const s = buildSealedResult('x', { ...good, name: '  Seal  ', flavorText: '  text  ' }, goodLLM);
    const c = mintCard(s, 'c', 'o', 'url');
    assert.equal(c.name, 'Seal');
    assert.equal(c.flavorText, 'text');
  });
});

// ─── discardSealedResult ──────────────────────────────────────────────────────

describe('discardSealedResult', () => {
  test('returns the fields needed to pre-fill Make', () => {
    const sealed = buildSealedResult('sub-001', good, goodLLM);
    const r = discardSealedResult(sealed);
    assert.equal(r.name, good.name);
    assert.equal(r.flavorText, good.flavorText);
    assert.equal(r.imageRef, good.imageRef);
  });
});

// ─── runCheckStep ─────────────────────────────────────────────────────────────

describe('runCheckStep — status: collection_full', () => {
  test('blocks when collection is at 20', async () => {
    const r = await runCheckStep(good, newPlayerState({ collectionTotal: 20 }),
      gate.allowed, llm.ok, 'sub-1');
    assert.equal(r.status, 'collection_full');
  });

  test('allows when collection is at 19', async () => {
    const r = await runCheckStep(good, newPlayerState({ collectionTotal: 19 }),
      gate.allowed, llm.ok, 'sub-1');
    assert.equal(r.status, 'allowed');
  });
});

describe('runCheckStep — status: error (bad input)', () => {
  test('returns error for empty name', async () => {
    const r = await runCheckStep(
      { ...good, name: '' },
      newPlayerState(),
      gate.allowed, llm.ok, 'sub-1',
    );
    assert.equal(r.status, 'error');
    assert.match(r.reason, /Name/);
  });
});

describe('runCheckStep — status: already_made', () => {
  test('catches a duplicate against current cards', async () => {
    const { fingerprint } = (await runCheckStep(good, newPlayerState(), gate.allowed, llm.ok, 'x')).sealedResult;
    const state = newPlayerState({
      fingerprints: [fingerprint],
      fingerprintNames: { [fingerprint]: good.name },
    });
    const r = await runCheckStep(good, state, gate.allowed, llm.ok, 'sub-2');
    assert.equal(r.status, 'already_made');
    assert.equal(r.isDeleted, false);
  });

  test('catches a duplicate against deleted cards', async () => {
    const { fingerprint } = (await runCheckStep(good, newPlayerState(), gate.allowed, llm.ok, 'x')).sealedResult;
    const state = newPlayerState({
      deletedFingerprints: [fingerprint],
      fingerprintNames: { [fingerprint]: good.name },
    });
    const r = await runCheckStep(good, state, gate.allowed, llm.ok, 'sub-3');
    assert.equal(r.status, 'already_made');
    assert.equal(r.isDeleted, true);
  });

  test('duplicate check is case- and punctuation-insensitive', async () => {
    const { fingerprint } = (await runCheckStep(good, newPlayerState(), gate.allowed, llm.ok, 'x')).sealedResult;
    const state = newPlayerState({ fingerprints: [fingerprint] });
    const r = await runCheckStep(
      { ...good, name: 'HARBOR SEAL!', flavorText: 'Playful, sleek, and social. Barks like a dog and sunbathes on docks.' },
      state, gate.allowed, llm.ok, 'sub-4',
    );
    assert.equal(r.status, 'already_made');
  });
});

describe('runCheckStep — status: declined', () => {
  test('gate decline returns declined status', async () => {
    const gate_declined = async () => ({
      verdict: 'declined',
      category: 'hate_speech',
      message: 'Contains hate speech.',
    });
    const r = await runCheckStep(good, newPlayerState(), gate_declined, llm.ok, 'sub-5');
    assert.equal(r.status, 'declined');
    assert.equal(r.category, 'hate_speech');
    assert.equal(r.message, 'Contains hate speech.');
  });
});

describe('runCheckStep — status: in_review', () => {
  test('gate review returns in_review status', async () => {
    const gate_review = async () => ({ verdict: 'review' });
    const r = await runCheckStep(good, newPlayerState(), gate_review, llm.ok, 'sub-6');
    assert.equal(r.status, 'in_review');
    assert.equal(r.submissionId, 'sub-6');
  });
});

describe('runCheckStep — status: allowed', () => {
  test('returns allowed with checkPayload and sealedResult', async () => {
    const r = await runCheckStep(good, newPlayerState(), gate.allowed, llm.ok, 'sub-7');
    assert.equal(r.status, 'allowed');
    assert.equal(r.submissionId, 'sub-7');
    assert.ok(r.checkPayload);
    assert.ok(r.sealedResult);
  });

  test('checkPayload has readAs and family but no stats', async () => {
    const r = await runCheckStep(good, newPlayerState(), gate.allowed, llm.ok, 'sub-8');
    assert.equal(r.status, 'allowed');
    const p = r.checkPayload;
    assert(p.readAs, 'readAs must be present');
    assert(p.family, 'family must be present');
    assert(p.kind, 'kind must be present');
    assert(!('power' in p), 'power must not be in checkPayload');
    assert(!('speed' in p), 'speed must not be in checkPayload');
    assert(!('wits'  in p), 'wits must not be in checkPayload');
  });
});

describe('runCheckStep — LLM retry on invalid response', () => {
  test(`retries up to ${MAX_LLM_TRIES} times then hard-fails`, async () => {
    let calls = 0;
    const bad_llm = async () => {
      calls++;
      return { power: 99, speed: 99, wits: 99, family: 'X', kind: '', readAs: '', reasoning: '', anchors: [] };
    };
    const r = await runCheckStep(good, newPlayerState(), gate.allowed, bad_llm, 'sub-9');
    assert.equal(r.status, 'error');
    assert.equal(calls, MAX_LLM_TRIES);
    assert.match(r.reason, /invalid card/);
  });

  test('succeeds on the second attempt if first fails', async () => {
    let calls = 0;
    const flaky_llm = async () => {
      calls++;
      if (calls === 1) return { power: 99 }; // invalid
      return goodLLM;
    };
    const r = await runCheckStep(good, newPlayerState(), gate.allowed, flaky_llm, 'sub-10');
    assert.equal(r.status, 'allowed');
    assert.equal(calls, 2);
  });
});

describe('runCheckStep — content gate error', () => {
  test('returns error when gate throws', async () => {
    const throwing_gate = async () => { throw new Error('connection failed'); };
    const r = await runCheckStep(good, newPlayerState(), throwing_gate, llm.ok, 'sub-11');
    assert.equal(r.status, 'error');
    assert.match(r.reason, /Content gate error/);
  });
});

// ─── runMintStep ──────────────────────────────────────────────────────────────

describe('runMintStep', () => {
  function buildSealed() {
    return buildSealedResult('sub-001', good, goodLLM);
  }

  const poolCards = POOL.map(c => ({
    id: c.id, family: c.family, carriesSeven: c.carriesSeven,
    power: c.power, speed: c.speed, wits: c.wits,
  }));
  const vitaNonSeven = poolCards.filter(c => c.family === 'Vita' && !c.carriesSeven);
  const terraNonSeven = poolCards.filter(c => c.family === 'Terra' && !c.carriesSeven);
  const arteNonSeven = poolCards.filter(c => c.family === 'Arte' && !c.carriesSeven);

  function legalActive() {
    return [
      ...vitaNonSeven.slice(0, 4),
      ...terraNonSeven.slice(0, 4),
      ...arteNonSeven.slice(0, 4),
    ];
  }

  test('succeeds with a full legal active deck (returns choice or inactive)', () => {
    const r = runMintStep(buildSealed(), 'card-1', 'p-1', 'url', legalActive(), []);
    assert.equal(r.ok, true);
    assert.ok(r.card);
    assert.ok(r.placement);
    assert(['choice', 'inactive'].includes(r.placement.placement));
  });

  test('places into active when deck has room', () => {
    const r = runMintStep(buildSealed(), 'card-1', 'p-1', 'url', legalActive().slice(0, 11), []);
    assert.equal(r.ok, true);
    assert.equal(r.placement.placement, 'active');
  });

  test('fails when no sealed result provided', () => {
    const r = runMintStep(null, 'card-1', 'p-1', 'url', [], []);
    assert.equal(r.ok, false);
    assert.match(r.reason, /No sealed result/);
  });

  test('card does not have demotedFrom', () => {
    const r = runMintStep(buildSealed(), 'card-1', 'p-1', 'url', legalActive().slice(0, 11), []);
    assert(!('demotedFrom' in r.card));
  });

  test('carriesSeven is correct for a seven-card', () => {
    const sevenLLM = { ...goodLLM, power: 7, speed: 4, wits: 1 };
    const sealedSeven = buildSealedResult('sub-s', good, sevenLLM);
    const r = runMintStep(sealedSeven, 'c7', 'p', 'url', legalActive().slice(0, 11), []);
    assert.equal(r.ok, true);
    assert.equal(r.card.carriesSeven, true);
  });
});

// ─── Integration: Check → Mint round-trip ────────────────────────────────────

describe('Integration: Check → Edit and Check → Mint', () => {
  test('Edit returns submission fields to pre-fill Make', async () => {
    const checkResult = await runCheckStep(good, newPlayerState(), gate.allowed, llm.ok, 'sub-i1');
    assert.equal(checkResult.status, 'allowed');
    const prefill = discardSealedResult(checkResult.sealedResult);
    assert.equal(prefill.name, good.name);
    assert.equal(prefill.flavorText, good.flavorText);
  });

  test('Mint after successful Check produces a valid Card', async () => {
    const checkResult = await runCheckStep(good, newPlayerState(), gate.allowed, llm.ok, 'sub-i2');
    assert.equal(checkResult.status, 'allowed');

    const poolCards = POOL.map(c => ({
      id: c.id, family: c.family, carriesSeven: c.carriesSeven,
      power: c.power, speed: c.speed, wits: c.wits,
    }));
    const activeCards = [
      ...poolCards.filter(c => c.family === 'Vita'  && !c.carriesSeven).slice(0, 3),
      ...poolCards.filter(c => c.family === 'Terra' && !c.carriesSeven).slice(0, 4),
      ...poolCards.filter(c => c.family === 'Arte'  && !c.carriesSeven).slice(0, 4),
    ]; // 11 cards, room for one more Vita

    const mintResult = runMintStep(
      checkResult.sealedResult,
      'card-final',
      'player-x',
      'https://cdn.example.com/seal.jpg',
      activeCards,
      [],
    );

    assert.equal(mintResult.ok, true);
    assert.equal(mintResult.card.name, good.name);
    assert.equal(mintResult.card.ownerId, 'player-x');
    assert.equal(mintResult.placement.placement, 'active');
    assert.equal(mintResult.placement.activeCount, 12);
  });

  test('second Check with the same card is blocked by duplicate', async () => {
    const first = await runCheckStep(good, newPlayerState(), gate.allowed, llm.ok, 'sub-d1');
    assert.equal(first.status, 'allowed');

    const fp = first.sealedResult.fingerprint;
    const state = newPlayerState({
      fingerprints: [fp],
      fingerprintNames: { [fp]: good.name },
    });

    const second = await runCheckStep(good, state, gate.allowed, llm.ok, 'sub-d2');
    assert.equal(second.status, 'already_made');
    assert.equal(second.isDeleted, false);
  });
});
