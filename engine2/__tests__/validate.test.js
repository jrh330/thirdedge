"use strict";
const { isLegalShape, validateCard, validateDeck } = require("../validate");
const { CARDS, BY_ID } = require("../fixtures");
const { RULE_SET } = require("../constants");

// Decks with ≤3 sevens for tests
// Seven-carriers among anchors:
//   Vita animals: cheetah(S7), bear(P7), owl(W7), elephant(P7)          → 4 sevens
//   Arte titans: hulk(P7), dragon(P7), colossus(P7)                     → 3 sevens
//   Terra: black-hole(P7), lightning-bolt(S7), glacier(P7)              → 3 sevens
//   Arte machines: freight-train(P7), fighter-jet(S7), supercomputer(W7), bulldozer(P7), drone(S7) → 5 sevens
//   Vita people: jimi-hendrix(W7)                                        → 1 seven
//   Vita spirits: wise-elder(W7), wanderlust(S7), muse(W7)              → 3 sevens

// validDeck12: 12 cards with exactly 3 sevens, ≤6 per family
// cheetah(S7)+bear(P7)+elephant(P7) = 3 sevens (Vita);
// fox+wolf+honey-badger (Vita, 3 non-sevens) → 6 Vita total (at the cap)
// kraken+frost-giant+yeti+troll (Arte, 4 non-sevens)
// nutmeg+obsidian (Terra, 2 non-sevens)
// Total: 6 Vita + 4 Arte + 2 Terra = 12 cards ✓
const validDeck12 = [
  "cheetah","bear","elephant",                    // 3 sevens (Vita)
  "fox","wolf","honey-badger",                    // 0 sevens (Vita) → 6 Vita total
  "kraken","frost-giant","yeti","troll",          // 0 sevens (Arte)
  "nutmeg","obsidian",                            // 0 sevens (Terra)
].map(id => BY_ID[id]);

describe("isLegalShape", () => {
  test("accepts all 8 legal shapes", () => {
    expect(isLegalShape(7, 4, 1)).toBe(true);
    expect(isLegalShape(7, 3, 2)).toBe(true);
    expect(isLegalShape(6, 5, 1)).toBe(true);
    expect(isLegalShape(6, 4, 2)).toBe(true);
    expect(isLegalShape(6, 3, 3)).toBe(true);
    expect(isLegalShape(5, 5, 2)).toBe(true);
    expect(isLegalShape(5, 4, 3)).toBe(true);
    expect(isLegalShape(4, 4, 4)).toBe(true);
  });

  test("accepts legal shapes in any order", () => {
    expect(isLegalShape(1, 7, 4)).toBe(true);  // cheetah shape
    expect(isLegalShape(2, 7, 3)).toBe(true);  // bulldozer shape
    expect(isLegalShape(3, 4, 5)).toBe(true);  // lockpick shape
  });

  test("rejects illegal shapes", () => {
    expect(isLegalShape(6, 6, 0)).toBe(false);
    expect(isLegalShape(5, 5, 3)).toBe(false);  // sums to 13
    expect(isLegalShape(4, 4, 3)).toBe(false);  // sums to 11
    expect(isLegalShape(7, 5, 0)).toBe(false);
  });
});

describe("validateCard", () => {
  test("all fixture cards are valid", () => {
    for (const card of CARDS) {
      const errors = validateCard(card);
      expect(errors).toEqual([]);
    }
  });

  test("rejects wrong budget", () => {
    const errors = validateCard({ power: 5, speed: 5, wits: 5, family: "Vita" });
    expect(errors.some(e => e.includes("sum"))).toBe(true);
  });

  test("rejects out-of-range stat", () => {
    const errors = validateCard({ power: 8, speed: 3, wits: 1, family: "Vita" });
    expect(errors.some(e => e.includes("power"))).toBe(true);
  });

  test("rejects stat below minimum", () => {
    const errors = validateCard({ power: 6, speed: 6, wits: 0, family: "Vita" });
    expect(errors.some(e => e.includes("wits"))).toBe(true);
  });

  test("rejects unknown family", () => {
    const errors = validateCard({ power: 4, speed: 4, wits: 4, family: "Alien" });
    expect(errors.some(e => e.includes("family"))).toBe(true);
  });
});

describe("validateDeck", () => {
  test("valid 12-card deck with 3 sevens passes", () => {
    const result = validateDeck(validDeck12, RULE_SET.FAMILY_WHEEL);
    expect(result.ok).toBe(true);
  });

  test("rejects deck with wrong size", () => {
    const result = validateDeck(validDeck12.slice(0, 11), RULE_SET.FAMILY_WHEEL);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/11 cards/);
  });

  test("rejects deck with 4 sevens", () => {
    // Replace a non-seven with owl(W7) to push sevens to 4
    const deck4sevens = [
      BY_ID["cheetah"], BY_ID["bear"], BY_ID["elephant"], BY_ID["owl"],  // 4 sevens
      BY_ID["fox"], BY_ID["wolf"], BY_ID["honey-badger"], BY_ID["alley-cat"],
      BY_ID["kraken"], BY_ID["frost-giant"], BY_ID["yeti"], BY_ID["troll"],
    ];
    const result = validateDeck(deck4sevens, RULE_SET.FAMILY_WHEEL);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/4 sevens/);
  });

  test("FAMILY_WHEEL rejects deck with too many cards of one family", () => {
    // Build a deck with 7 Vita cards (exceeds FAMILY_MAX=6)
    // Vita non-sevens: fox, wolf, honey-badger, alley-cat, jimi-hendrix, teddy-roosevelt,
    //   muhammad-ali, cleopatra, houdini, babe-ruth, nightmare, grudge, muse
    // Vita sevens: cheetah(S7), bear(P7), elephant(P7), owl(W7), wise-elder(W7), wanderlust(S7)
    // Use 7 Vita: fox, wolf, honey-badger, alley-cat, muhammad-ali, cleopatra, houdini (all non-seven)
    // + 5 Arte: swiss-army-knife, troll, golem, lockpick, ghost
    const tooManyVita = [
      BY_ID["fox"], BY_ID["wolf"], BY_ID["honey-badger"], BY_ID["alley-cat"],
      BY_ID["muhammad-ali"], BY_ID["cleopatra"], BY_ID["houdini"],
      BY_ID["swiss-army-knife"], BY_ID["troll"], BY_ID["golem"],
      BY_ID["lockpick"], BY_ID["ghost"],
    ];
    const result = validateDeck(tooManyVita, RULE_SET.FAMILY_WHEEL);
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes("Vita"))).toBe(true);
  });

  test("CREW rule: rejects when no family appears 5–7 times", () => {
    const mixed = [
      ...CARDS.filter(c => c.family === "Vita").slice(0, 3),
      ...CARDS.filter(c => c.family === "Arte").slice(0, 3),
      ...CARDS.filter(c => c.family === "Terra").slice(0, 3),
      ...CARDS.filter(c => c.family === "Vita").slice(3, 6),  // total 6 but across two slices
    ];
    // Build a true mixed deck: 3 Vita + 3 Arte + 3 Terra + 1 Vita + 2 Arte = doesn't reach 5 per family
    const mixedDeck = [
      ...CARDS.filter(c => c.family === "Vita").slice(0, 4),
      ...CARDS.filter(c => c.family === "Arte").slice(0, 4),
      ...CARDS.filter(c => c.family === "Terra").slice(0, 4),
    ];
    const result = validateDeck(mixedDeck, RULE_SET.CREW);
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes("CREW"))).toBe(true);
  });

  test("CREW rule: valid deck with 6 Vita + 6 Arte passes", () => {
    // 6 Vita non-sevens: fox(V), wolf(V), honey-badger(V), alley-cat(V), muhammad-ali(V), cleopatra(V)
    // 6 Arte non-sevens: swiss-army-knife(A), troll(A), golem(A), lockpick(A), ghost(A), poltergeist(A)
    const vita6 = [
      BY_ID["fox"], BY_ID["wolf"], BY_ID["honey-badger"], BY_ID["alley-cat"],
      BY_ID["muhammad-ali"], BY_ID["cleopatra"],
    ];
    const arte6 = [
      BY_ID["swiss-army-knife"], BY_ID["troll"], BY_ID["golem"],
      BY_ID["lockpick"], BY_ID["ghost"], BY_ID["poltergeist"],
    ];
    const deck = [...vita6, ...arte6];
    const result = validateDeck(deck, RULE_SET.CREW);
    expect(result.ok).toBe(true);
  });
});
