"use strict";

/**
 * The starter pool: player-made cards (with real pictures) that admin has
 * ticked on /admin. New players are dealt copies of these instead of the
 * picture-less 30-card test pool, once there are enough of them.
 *
 * A card is in the pool when its cardsv2 doc has inStarterPool: true.
 * Copies dealt to players are separate docs (source: "sample"), so the
 * original owner keeps their card.
 */

const POOL_MIN = 24; // two decks of 12 — below this, fall back to the test pool

async function loadStarterPool(db) {
  const cards = await db.collection("cardsv2")
    .find({ inStarterPool: true, deleted: { $ne: true }, imageUrl: { $ne: null } })
    .toArray();
  return cards.map(c => ({
    id:           c.id,
    name:         c.name,
    kind:         c.kind,
    family:       c.family,
    power:        c.power,
    speed:        c.speed,
    wits:         c.wits,
    carriesSeven: !!(c.carriesSeven || c.power === 7 || c.speed === 7 || c.wits === 7),
    imageUrl:     c.imageUrl,
    flavorText:   c.flavorText || null,
  }));
}

module.exports = { loadStarterPool, POOL_MIN };
