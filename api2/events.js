'use strict';

/**
 * POST /api2/events
 * Client-side funnel event logging. Auth required.
 * Body: { event, matchCode? }
 *
 * Accepted client events: make_started, rejoined
 * (Server-side events are logged directly and cannot be replayed from the client.)
 */

const { requirePlayer } = require('../auth/player');
const { logEvent } = require('./_events');

const CLIENT_EVENTS = new Set(['make_started', 'rejoined']);

module.exports = async function clientEvent(req, res) {
  let player;
  try { player = await requirePlayer(req); }
  catch (e) {
    if (e.status && e.body) return res.status(e.status).json(e.body);
    throw e;
  }

  const { event, matchCode } = req.body || {};
  if (!event || !CLIENT_EVENTS.has(event)) {
    return res.status(400).json({ error: `event must be one of: ${[...CLIENT_EVENTS].join(', ')}` });
  }

  const extras = matchCode ? { matchCode } : {};
  logEvent(player.id, event, extras);
  return res.json({ ok: true });
};
