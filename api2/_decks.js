"use strict";

// Four preset decks. Each has exactly 12 cards and ≤3 seven-carriers (SEVEN_ALLOWANCE).
// Some card IDs appear in multiple presets — this is fine for regular play.
// The trade guard in match.js (winnerOwns check) prevents duplicate IDs from
// ever entering a single player's deck via a trade.
const PRESETS = [
  {
    name: "Even Hand",
    desc: "A card from every family. Flexible and hard to predict.",
    cards: [
      "wolf","fox","kraken","cheetah",
      "babe-ruth","houdini","swiss-army-knife","freight-train",
      "monsoon","obsidian","nightmare","black-hole",
    ],
  },
  {
    name: "The Wall",
    desc: "Seven Living cards. Bonds fire constantly, and Made decks fear you.",
    cards: [
      "bear","cheetah","wolf","fox","honey-badger","alley-cat","kraken",
      "swiss-army-knife","lockpick","babe-ruth","monsoon","grudge",
    ],
  },
  {
    name: "Two Camps",
    desc: "Strong Living + Made core with a few Raw cards to keep opponents guessing.",
    cards: [
      "wolf","fox","honey-badger","yeti","elephant",
      "swiss-army-knife","clockwork-mouse","muhammad-ali","cleopatra","fighter-jet",
      "platinum","echo",
    ],
  },
  {
    name: "Weighted",
    desc: "Titan-heavy Living with elite Made support. High stats across the board.",
    cards: [
      "troll","golem","yeti","frost-giant","hulk","dragon",
      "sherlock-holmes","teddy-roosevelt","houdini","supercomputer",
      "nutmeg","ghost",
    ],
  },
];

module.exports = { PRESETS };
