"use strict";
const { createMatch, submitPlayerMove, advanceMatchTurn, currentRound } = require("../match");
const { BY_ID } = require("../fixtures");
const { RULE_SET } = require("../constants");

const deckA = ["cheetah","bear","elephant","fox","wolf","honey-badger",
  "kraken","frost-giant","yeti","troll","nutmeg","obsidian"].map(id => BY_ID[id]);
const deckB = ["freight-train","fighter-jet","jimi-hendrix","swiss-army-knife",
  "clockwork-mouse","lockpick","teddy-roosevelt","muhammad-ali","cleopatra",
  "houdini","babe-ruth","sherlock-holmes"].map(id => BY_ID[id]);
const CATS = ["power", "speed", "wits"];

// Deterministic pseudo-random so failures reproduce
function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

describe("round.upNext predicts what continuing after a reveal leads to", () => {
  for (const seed of [1, 7, 42, 99, 1234, 31337]) {
    test(`seed ${seed}: every prediction matches the real outcome`, () => {
      const rand = rng(seed);
      let m = createMatch("m", "A", deckA, "B", deckB, RULE_SET.FAMILY_WHEEL, { skipShuffle: true });
      let reveals = 0;
      for (let step = 0; step < 500 && !m.winnerId; step++) {
        const r = currentRound(m);
        if (r.phase === "reveal") {
          const { kind, winnerId } = r.upNext;
          const roundsBefore = m.rounds.length;
          const wonBefore = { ...m.roundsWon };
          m = advanceMatchTurn(m);
          reveals++;
          if (kind === "match") {
            expect(m.winnerId).toBe(winnerId);
          } else if (kind === "round") {
            expect(m.winnerId).toBeNull();
            expect(m.roundsWon[winnerId]).toBe(wonBefore[winnerId] + 1);
            expect(m.rounds.length).toBe(roundsBefore + 1);
          } else if (kind === "replay") {
            expect(m.rounds.length).toBe(roundsBefore + 1);
            expect(m.roundsWon).toEqual(wonBefore);
          } else {
            expect(kind).toBe("turn");
            expect(m.rounds.length).toBe(roundsBefore);
            expect(m.winnerId).toBeNull();
          }
          continue;
        }
        for (const p of r.players) {
          if (r.pending && r.pending[p.playerId]) continue;
          const card = p.hand[Math.floor(rand() * p.hand.length)];
          const cat = r.phase === "opening" ? null : CATS[Math.floor(rand() * 3)];
          m = submitPlayerMove(m, p.playerId, card, cat);
          if (currentRound(m) !== r && currentRound(m).phase !== r.phase) break;
        }
      }
      expect(m.winnerId).toBeTruthy();
      expect(reveals).toBeGreaterThan(0);
    });
  }
});
