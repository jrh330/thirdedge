"use strict";
const { isLegalShape, validateCard, validateDeck } = require("../validate");
const { CARDS, BY_ID } = require("../fixtures");
const { RULE_SET } = require("../constants");

// Decks with ≤3 sevens for tests
// Seven-carriers among anchors:
//   Beast: cheetah(S7), bear(P7), owl(W7), elephant(P7)          → 4 sevens
//   Titan: hulk(P7), dragon(P7), colossus(P7)                     → 3 sevens
//   Element: black-hole(P7), lightning-bolt(S7), glacier(P7)      → 3 sevens
//   Machine: freight-train(P7), fighter-jet(S7), supercomputer(W7), bulldozer(P7), drone(S7) → 5 sevens
//   Icon: jimi-hendrix(W7), air-force-1s(S7)                      → 2 sevens
//   Spirit: wise-elder(W7), wanderlust(S7), muse(W7)              → 3 sevens

// validDeck12: 12 cards with exactly 3 sevens
// cheetah(S7)+bear(P7)+elephant(P7) = 3 sevens; fox+wolf+honey-badger+alley-cat+kraken+frost-giant+yeti+troll+golem = 9 no-sevens
const validDeck12 = [
  "cheetah","bear","elephant",                    // 3 sevens (Living)
  "fox","wolf","honey-badger","alley-cat",        // 0 sevens (Living)
  "kraken","frost-giant","yeti","troll","golem",  // 0 sevens (Living)
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
  test("all 48 fixture cards are valid", () => {
    for (const card of CARDS) {
      const errors = validateCard(card);
      expect(errors).toEqual([]);
    }
  });

  test("rejects wrong budget", () => {
    const errors = validateCard({ power: 5, speed: 5, wits: 5, trait: "Beast" });
    expect(errors.some(e => e.includes("sum"))).toBe(true);
  });

  test("rejects out-of-range stat", () => {
    const errors = validateCard({ power: 8, speed: 3, wits: 1, trait: "Beast" });
    expect(errors.some(e => e.includes("power"))).toBe(true);
  });

  test("rejects stat below minimum", () => {
    const errors = validateCard({ power: 6, speed: 6, wits: 0, trait: "Beast" });
    expect(errors.some(e => e.includes("wits"))).toBe(true);
  });

  test("rejects unknown trait", () => {
    const errors = validateCard({ power: 4, speed: 4, wits: 4, trait: "Alien" });
    expect(errors.some(e => e.includes("trait"))).toBe(true);
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

  test("CREW rule: rejects when no trait appears 5–7 times", () => {
    const mixed = [
      ...CARDS.filter(c => c.trait === "Beast").slice(0, 3),
      ...CARDS.filter(c => c.trait === "Titan").slice(0, 3),
      ...CARDS.filter(c => c.trait === "Element").slice(0, 2),
      ...CARDS.filter(c => c.trait === "Machine").slice(0, 2),
      ...CARDS.filter(c => c.trait === "Icon").slice(0, 1),
      ...CARDS.filter(c => c.trait === "Spirit").slice(0, 1),
    ];
    const result = validateDeck(mixed, RULE_SET.CREW);
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes("CREW"))).toBe(true);
  });

  test("CREW rule: valid deck with 6 non-seven Beasts + 6 non-seven others passes", () => {
    // Use only the 4 no-seven Beasts + 2 no-seven Titans (can't reach 6 unique Beast non-sevens from 8 cards…)
    // Actually: Beast non-sevens: fox, wolf, honey-badger, alley-cat = 4 only
    // Can't make 6 Beasts without sevens. Use 6 spirits (all non-seven spirits available):
    // spirit non-sevens: ghost, poltergeist, nightmare, grudge, echo = 5... wanderlust(S7) is seven
    // Use 6 spirits: ghost+poltergeist+nightmare+grudge+echo + muse(W7) — but that's a seven
    // Use 5 spirits + 1 non-seven element:
    // Actually the CREW rule just needs ONE trait with 5-7 cards. Let's use ghosts+spirits:
    // Spirits without sevens: ghost(P2S5W5), poltergeist(P4S6W2), nightmare(P5S4W3), grudge(P6S3W3), echo(P4S4W4) = 5 non-seven Spirits + wanderlust(S7) = 1 seven
    // Make 6-Spirit deck: ghost, poltergeist, nightmare, grudge, echo (5 non-seven) + wanderlust(S7) = 6 Spirits (1 seven)
    // + 6 non-seven icons: teddy-roosevelt, muhammad-ali, cleopatra, houdini, babe-ruth, sherlock-holmes
    const spirits6 = [
      BY_ID["ghost"], BY_ID["poltergeist"], BY_ID["nightmare"],
      BY_ID["grudge"], BY_ID["echo"], BY_ID["wanderlust"],  // 1 seven
    ];
    const icons6 = [
      BY_ID["teddy-roosevelt"], BY_ID["muhammad-ali"], BY_ID["cleopatra"],
      BY_ID["houdini"], BY_ID["babe-ruth"], BY_ID["sherlock-holmes"],
    ];
    const deck = [...spirits6, ...icons6];
    const result = validateDeck(deck, RULE_SET.CREW);
    expect(result.ok).toBe(true);
  });
});
