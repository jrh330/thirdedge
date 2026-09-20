'use strict';

/**
 * Shared utilities for route handlers.
 */

// Strict allowlist for ?next= / body.next values.
// Accepts only relative paths the SPA actually handles.
const NEXT_RE = /^\/(play|make|g\/[A-Za-z0-9]{4,8})$/;

/**
 * Returns the validated next path, or '/play' if it fails validation.
 * Never returns an absolute URL, protocol-relative URL, or unknown path.
 *
 * @param {string|undefined} raw
 * @returns {string}
 */
function validateNext(raw) {
  if (!raw || typeof raw !== 'string') return '/play';
  const trimmed = raw.trim();
  if (NEXT_RE.test(trimmed)) return trimmed;
  return '/play';
}

module.exports = { validateNext };
