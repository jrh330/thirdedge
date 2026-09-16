"use strict";
// Anchor cards — family system (Vita / Terra / Arte)
// Format: [id, name, family, power, speed, wits]
// All cards: power+speed+wits === 12, each stat 1–7

const RAW = [
  // Vita — real animals (was Beast)
  ["cheetah",         "Cheetah",          "Vita",  1, 7, 4],
  ["bear",            "Bear",             "Vita",  7, 3, 2],
  ["owl",             "Owl",              "Vita",  1, 4, 7],
  ["elephant",        "Elephant",         "Vita",  7, 1, 4],
  ["fox",             "Fox",              "Vita",  2, 5, 5],
  ["wolf",            "Wolf",             "Vita",  4, 5, 3],
  ["honey-badger",    "Honey Badger",     "Vita",  5, 4, 3],
  ["alley-cat",       "Alley Cat",        "Vita",  4, 4, 4],

  // Vita — real people (was Icon, real people only)
  ["jimi-hendrix",    "Jimi Hendrix",     "Vita",  1, 4, 7],
  ["teddy-roosevelt", "Teddy Roosevelt",  "Vita",  4, 2, 6],
  ["muhammad-ali",    "Muhammad Ali",     "Vita",  4, 6, 2],
  ["cleopatra",       "Cleopatra",        "Vita",  4, 3, 5],
  ["houdini",         "Houdini",          "Vita",  2, 6, 4],
  ["babe-ruth",       "Babe Ruth",        "Vita",  5, 4, 3],

  // Vita — felt and undergone (was Spirit, real states)
  ["wise-elder",      "Wise Elder",       "Vita",  2, 3, 7],
  ["nightmare",       "Nightmare",        "Vita",  5, 4, 3],
  ["grudge",          "Grudge",           "Vita",  6, 3, 3],
  ["wanderlust",      "Wanderlust",       "Vita",  2, 7, 3],
  ["muse",            "Muse",             "Vita",  1, 4, 7],

  // Terra — natural phenomena and materials (was Element + Echo)
  ["black-hole",      "Black Hole",       "Terra", 7, 1, 4],
  ["lightning-bolt",  "Lightning Bolt",   "Terra", 3, 7, 2],
  ["glacier",         "Glacier",          "Terra", 7, 1, 4],
  ["wildfire",        "Wildfire",         "Terra", 6, 5, 1],
  ["nutmeg",          "Nutmeg",           "Terra", 2, 5, 5],
  ["platinum",        "Platinum",         "Terra", 5, 2, 5],
  ["monsoon",         "Monsoon",          "Terra", 5, 5, 2],
  ["obsidian",        "Obsidian",         "Terra", 6, 3, 3],
  ["echo",            "Echo",             "Terra", 4, 4, 4],

  // Arte — invented beings (was Titan)
  ["hulk",            "Hulk",             "Arte",  7, 4, 1],
  ["dragon",          "Dragon",           "Arte",  7, 4, 1],
  ["kraken",          "Kraken",           "Arte",  6, 3, 3],
  ["colossus",        "Colossus",         "Arte",  7, 1, 4],
  ["frost-giant",     "Frost Giant",      "Arte",  6, 5, 1],
  ["yeti",            "Yeti",             "Arte",  5, 4, 3],
  ["troll",           "Troll",            "Arte",  4, 4, 4],
  ["golem",           "Golem",            "Arte",  5, 2, 5],
  ["ghost",           "Ghost",            "Arte",  2, 5, 5],
  ["poltergeist",     "Poltergeist",      "Arte",  4, 6, 2],

  // Arte — made objects (was Machine + fictional Icon)
  ["freight-train",     "Freight Train",    "Arte",  7, 4, 1],
  ["fighter-jet",       "Fighter Jet",      "Arte",  3, 7, 2],
  ["supercomputer",     "Supercomputer",    "Arte",  1, 4, 7],
  ["swiss-army-knife",  "Swiss Army Knife", "Arte",  4, 4, 4],
  ["bulldozer",         "Bulldozer",        "Arte",  7, 3, 2],
  ["drone",             "Drone",            "Arte",  2, 7, 3],
  ["clockwork-mouse",   "Clockwork Mouse",  "Arte",  2, 5, 5],
  ["lockpick",          "Lockpick",         "Arte",  3, 4, 5],
  ["air-force-1s",      "Air Force 1s",     "Arte",  3, 7, 2],
  ["sherlock-holmes",   "Sherlock Holmes",  "Arte",  2, 5, 5],
];

const CARDS = RAW.map(([id, name, family, power, speed, wits]) => ({
  id,
  name,
  family,
  power,
  speed,
  wits,
  carriesSeven: Math.max(power, speed, wits) === 7,
  ownerId: "anchor",
  imageUrl: "",
  flavorText: "",
  aiReasoning: "",
  aiAnchors: [],
}));

// Quick lookup by id
const BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));

module.exports = { CARDS, BY_ID };
