'use strict';

/**
 * Funnel event logger.
 *
 * logEvent(playerId, event, extras?)
 *
 * Fire-and-forget: never throws, never blocks the caller.
 * Writes one document to `eventsv1`.
 *
 * Standard event names:
 *   invite_opened, session_created, name_set, samples_given,
 *   make_started, check_passed, check_declined, card_minted,
 *   match_created, match_joined, match_finished, rejoined
 *
 * Fields written: playerId, event, at, plus any extras (e.g. matchCode).
 */

const { getDb } = require('./_db');

async function logEvent(playerId, event, extras = {}) {
  try {
    const db = await getDb();
    await db.collection('eventsv1').insertOne({
      playerId,
      event,
      at: new Date(),
      ...extras,
    });
  } catch (err) {
    // Never let event logging break the caller
    console.error('logEvent failed [%s]:', event, err.message);
  }
}

module.exports = { logEvent };
