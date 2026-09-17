'use strict';

/**
 * minting.js — Allagaroo minting pipeline (Phase 2)
 *
 * Implements spec §4.1 as pure, framework-agnostic logic. No HTTP, no database,
 * no file I/O. Every external dependency (LLM call, content gate, persistence) is
 * injected as a function argument so the module is fully testable.
 *
 * @module minting
 */

const { makeFingerprint, checkDuplicate, placeMintedCard } = require('./collection');

// ─── Constants ───────────────────────────────────────────────────────────────

const STAT_BUDGET   = 12;
const STAT_MIN      = 1;
const STAT_MAX      = 7;
const NAME_MAX      = 28;
const FLAVOR_MAX    = 160;
const MAX_LLM_TRIES = 3;

const LEGAL_SHAPES = new Set([
  '7/4/1', '7/3/2', '6/5/1', '6/4/2', '6/3/3', '5/5/2', '5/4/3', '4/4/4',
]);

const VALID_FAMILIES = new Set(['Vita', 'Terra', 'Arte']);

// ─── Input validation ─────────────────────────────────────────────────────────

/**
 * Validate the raw player submission before any server work.
 * Returns { ok: boolean, reason?: string }.
 *
 * @param {{ name: string, flavorText: string, imageUrl?: string }} submission
 */
function validateSubmission(submission) {
  const { name, flavorText } = submission;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return { ok: false, reason: 'Name is required' };
  }
  if (name.trim().length > NAME_MAX) {
    return { ok: false, reason: `Name must be ${NAME_MAX} characters or fewer` };
  }
  if (!flavorText || typeof flavorText !== 'string' || !flavorText.trim()) {
    return { ok: false, reason: '"About it" text is required' };
  }
  if (flavorText.trim().length > FLAVOR_MAX) {
    return { ok: false, reason: `"About it" text must be ${FLAVOR_MAX} characters or fewer` };
  }
  return { ok: true };
}

// ─── LLM response validation ──────────────────────────────────────────────────

/**
 * Validate the raw JSON object returned by the LLM.
 * Returns { ok: boolean, reason?: string }.
 *
 * @param {object} raw
 */
function validateLLMResponse(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'Response is not an object' };
  }

  const { power, speed, wits, family, kind, readAs, reasoning, anchors } = raw;

  // Stat presence and type
  for (const [key, val] of [['power', power], ['speed', speed], ['wits', wits]]) {
    if (!Number.isInteger(val)) {
      return { ok: false, reason: `"${key}" must be an integer` };
    }
    if (val < STAT_MIN || val > STAT_MAX) {
      return { ok: false, reason: `"${key}" must be between ${STAT_MIN} and ${STAT_MAX} (got ${val})` };
    }
  }

  // Budget
  if (power + speed + wits !== STAT_BUDGET) {
    return { ok: false, reason: `Stats must total ${STAT_BUDGET} (got ${power + speed + wits})` };
  }

  // Legal shape
  const sorted = [power, speed, wits].sort((a, b) => b - a);
  const shapeKey = sorted.join('/');
  if (!LEGAL_SHAPES.has(shapeKey)) {
    return { ok: false, reason: `${shapeKey} is not one of the 8 legal shapes` };
  }

  // Family
  if (!VALID_FAMILIES.has(family)) {
    return { ok: false, reason: `"family" must be Vita, Terra or Arte (got "${family}")` };
  }

  // Kind: 1–2 words, present
  if (!kind || typeof kind !== 'string' || !kind.trim()) {
    return { ok: false, reason: '"kind" is required' };
  }
  const kindWords = kind.trim().split(/\s+/);
  if (kindWords.length > 2) {
    return { ok: false, reason: '"kind" must be 1–2 words' };
  }

  // readAs: present, not the numbers
  if (!readAs || typeof readAs !== 'string' || !readAs.trim()) {
    return { ok: false, reason: '"readAs" is required' };
  }
  if (/\b(power|speed|wits)\s*\d/i.test(readAs) || /\b\d+\s*\/\s*\d+/i.test(readAs)) {
    return { ok: false, reason: '"readAs" must not contain stats or stat numbers' };
  }

  // Reasoning and anchors
  if (!reasoning || typeof reasoning !== 'string' || !reasoning.trim()) {
    return { ok: false, reason: '"reasoning" is required' };
  }
  if (!Array.isArray(anchors) || anchors.length === 0) {
    return { ok: false, reason: '"anchors" must be a non-empty array' };
  }

  return { ok: true };
}

// ─── Sealed result ────────────────────────────────────────────────────────────

/**
 * Build a sealed result from a validated LLM response.
 *
 * @param {string} submissionId
 * @param {{ name, flavorText, imageRef }} submission
 * @param {object} llmResponse   — already validated
 * @returns {object}
 */
function buildSealedResult(submissionId, submission, llmResponse) {
  const { power, speed, wits, family, kind, readAs, reasoning, anchors } = llmResponse;
  const fingerprint = makeFingerprint(submission.name, submission.flavorText);
  const carriesSeven = Math.max(power, speed, wits) === 7;

  return {
    submissionId,
    sealedAt: Date.now(),
    // What the Check screen may show:
    checkVisible: { readAs, family, kind, reasoning, anchors },
    // What gets created at Mint (never sent to the client before Mint):
    sealed: { power, speed, wits, family, kind, readAs, reasoning, anchors },
    submission: {
      name: submission.name.trim(),
      flavorText: submission.flavorText.trim(),
      imageRef: submission.imageRef ?? null,
    },
    fingerprint,
    carriesSeven,
  };
}

/**
 * Extract the Check-screen payload from a sealed result.
 * Safe to send to the client — contains no numbers.
 *
 * @param {object} sealedResult
 * @returns {{ readAs, family, kind, reasoning, anchors }}
 */
function getCheckPayload(sealedResult) {
  return { ...sealedResult.checkVisible };
}

/**
 * Mint a card from a sealed result.
 *
 * @param {object} sealedResult
 * @param {string} cardId
 * @param {string} ownerId
 * @param {string} imageUrl
 * @returns {object}  — Card (spec §3)
 */
function mintCard(sealedResult, cardId, ownerId, imageUrl) {
  const { sealed, submission, fingerprint, carriesSeven } = sealedResult;
  return {
    id: cardId,
    ownerId,
    name: submission.name,
    imageUrl,
    flavorText: submission.flavorText,
    power:      sealed.power,
    speed:      sealed.speed,
    wits:       sealed.wits,
    family:     sealed.family,
    kind:       sealed.kind,
    carriesSeven,
    aiReasoning: sealed.reasoning,
    aiAnchors:   sealed.anchors,
    fingerprint,
    // No demotedFrom — retired 2026-09-15
  };
}

// ─── Full pipeline ────────────────────────────────────────────────────────────

/**
 * Run the Check step of the minting pipeline.
 *
 * @param {{ name, flavorText, imageRef }}  submission
 * @param {{ collectionTotal, fingerprints, deletedFingerprints, deletedCardNames }} playerState
 * @param {Function} contentGate   async (submission) => { verdict: 'allowed'|'declined'|'review', category?, message? }
 * @param {Function} llmScore      async (submission) => raw JSON object (may throw)
 * @param {string}   submissionId  caller-supplied UUID for this attempt
 */
async function runCheckStep(
  submission,
  playerState,
  contentGate,
  llmScore,
  submissionId,
) {
  const { collectionTotal, fingerprints, deletedFingerprints, deletedCardNames } = playerState;
  if (collectionTotal >= 20) {
    return { status: 'collection_full' };
  }

  const inputCheck = validateSubmission(submission);
  if (!inputCheck.ok) {
    return { status: 'error', reason: inputCheck.reason };
  }

  const allFingerprints = [...(fingerprints ?? []), ...(deletedFingerprints ?? [])];
  const { duplicate, fingerprint } = checkDuplicate(
    submission.name,
    submission.flavorText,
    allFingerprints,
  );
  if (duplicate) {
    const isDeleted = (deletedFingerprints ?? []).includes(fingerprint);
    const matchedFp = fingerprint;
    const matchedName = playerState.fingerprintNames?.[matchedFp] ?? submission.name;
    return { status: 'already_made', matchedName, isDeleted };
  }

  let gateResult;
  try {
    gateResult = await contentGate(submission);
  } catch (err) {
    return { status: 'error', reason: `Content gate error: ${err.message}` };
  }

  if (gateResult.verdict === 'declined') {
    return {
      status: 'declined',
      category: gateResult.category ?? 'policy',
      message: gateResult.message ?? 'This submission cannot be minted.',
    };
  }
  if (gateResult.verdict === 'review') {
    return { status: 'in_review', submissionId };
  }

  let llmResponse = null;
  let lastValidationError = null;

  for (let attempt = 0; attempt < MAX_LLM_TRIES; attempt++) {
    let raw;
    try {
      raw = await llmScore(submission, attempt);
    } catch (err) {
      return { status: 'error', reason: `Scoring error: ${err.message}` };
    }

    const validation = validateLLMResponse(raw);
    if (validation.ok) {
      llmResponse = raw;
      break;
    }
    lastValidationError = validation.reason;
  }

  if (!llmResponse) {
    return { status: 'error', reason: `Scoring produced an invalid card after ${MAX_LLM_TRIES} attempts: ${lastValidationError}` };
  }

  const sealedResult = buildSealedResult(submissionId, submission, llmResponse);

  return {
    status: 'allowed',
    submissionId,
    checkPayload: getCheckPayload(sealedResult),
    sealedResult,
  };
}

/**
 * Run the Mint step.
 *
 * @param {object}   sealedResult
 * @param {string}   cardId
 * @param {string}   ownerId
 * @param {string}   imageUrl
 * @param {object[]} activeCards
 * @param {string[]} inactiveIds
 * @returns {{ ok: boolean, reason?: string, card?: object, placement?: object }}
 */
function runMintStep(sealedResult, cardId, ownerId, imageUrl, activeCards, inactiveIds) {
  if (!sealedResult) {
    return { ok: false, reason: 'No sealed result found — did the Check step complete?' };
  }

  const card = mintCard(sealedResult, cardId, ownerId, imageUrl);

  const recheck = validateLLMResponse({
    power:     card.power,
    speed:     card.speed,
    wits:      card.wits,
    family:    card.family,
    kind:      card.kind,
    readAs:    sealedResult.sealed.readAs,
    reasoning: card.aiReasoning,
    anchors:   card.aiAnchors,
  });
  if (!recheck.ok) {
    return { ok: false, reason: `Mint validation failed: ${recheck.reason}` };
  }

  const placement = placeMintedCard(card, activeCards, inactiveIds);

  return { ok: true, card, placement };
}

/**
 * Discard a sealed result (player chose Edit).
 *
 * @param {object} sealedResult
 * @returns {{ name: string, flavorText: string, imageRef: string|null }}
 */
function discardSealedResult(sealedResult) {
  const { name, flavorText, imageRef } = sealedResult.submission;
  return { name, flavorText, imageRef };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  STAT_BUDGET,
  STAT_MIN,
  STAT_MAX,
  NAME_MAX,
  FLAVOR_MAX,
  MAX_LLM_TRIES,
  LEGAL_SHAPES,
  VALID_FAMILIES,
  validateSubmission,
  validateLLMResponse,
  buildSealedResult,
  getCheckPayload,
  mintCard,
  runCheckStep,
  runMintStep,
  discardSealedResult,
};
