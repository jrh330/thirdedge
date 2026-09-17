/**
 * game.js — client-side wrapper re-exporting only what the minting UI needs.
 *
 * The server modules (game/minting.js, game/collection.js) are CJS and reference
 * each other with require(). Rather than trying to bundle them through Vite,
 * we copy out only the pure constants and validator functions that the client
 * actually needs. Server-side pipeline functions (runCheckStep, runMintStep, etc.)
 * are NOT re-exported — those live on the server.
 */

// ── Constants (from game/minting.js) ─────────────────────────────────────────

export const NAME_MAX   = 28;
export const FLAVOR_MAX = 160;

export const VALID_FAMILIES = new Set(['Vita', 'Terra', 'Arte']);

// ── Input validation (mirrors validateSubmission in game/minting.js) ─────────

/**
 * Validate the raw player submission before sending to the server.
 * Returns { ok: boolean, reason?: string }.
 *
 * @param {{ name: string, flavorText: string }} submission
 */
export function validateSubmission({ name, flavorText }) {
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

// ── Collection constants (from game/collection.js) ────────────────────────────

export const COLLECTION_MAX = 20;
export const ACTIVE_SIZE    = 12;
export const INACTIVE_MAX   = 8;
export const FAMILY_MAX     = 6;
