"use strict";
// 48 anchor cards from clash-playtest-familywheel.html
// Format: { id, name, trait, power, speed, wits }
// All cards: power+speed+wits === 12, each stat 1–7

const RAW = [
  // Beast (Living)
  ["cheetah",       "Cheetah",         "Beast",   1, 7, 4],
  ["bear",          "Bear",            "Beast",   7, 3, 2],
  ["owl",           "Owl",             "Beast",   1, 4, 7],
  ["elephant",      "Elephant",        "Beast",   7, 1, 4],
  ["fox",           "Fox",             "Beast",   2, 5, 5],
  ["wolf",          "Wolf",            "Beast",   4, 5, 3],
  ["honey-badger",  "Honey Badger",    "Beast",   5, 4, 3],
  ["alley-cat",     "Alley Cat",       "Beast",   4, 4, 4],

  // Titan (Living)
  ["hulk",          "Hulk",            "Titan",   7, 4, 1],
  ["dragon",        "Dragon",          "Titan",   7, 4, 1],
  ["kraken",        "Kraken",          "Titan",   6, 3, 3],
  ["colossus",      "Colossus",        "Titan",   7, 1, 4],
  ["frost-giant",   "Frost Giant",     "Titan",   6, 5, 1],
  ["yeti",          "Yeti",            "Titan",   5, 4, 3],
  ["troll",         "Troll",           "Titan",   4, 4, 4],
  ["golem",         "Golem",           "Titan",   5, 2, 5],

  // Element (Raw)
  ["black-hole",    "Black Hole",      "Element", 7, 1, 4],
  ["lightning-bolt","Lightning Bolt",  "Element", 3, 7, 2],
  ["glacier",       "Glacier",         "Element", 7, 1, 4],
  ["wildfire",      "Wildfire",        "Element", 6, 5, 1],
  ["nutmeg",        "Nutmeg",          "Element", 2, 5, 5],
  ["platinum",      "Platinum",        "Element", 5, 2, 5],
  ["monsoon",       "Monsoon",         "Element", 5, 5, 2],
  ["obsidian",      "Obsidian",        "Element", 6, 3, 3],

  // Machine (Made)
  ["freight-train", "Freight Train",   "Machine", 7, 4, 1],
  ["fighter-jet",   "Fighter Jet",     "Machine", 3, 7, 2],
  ["supercomputer", "Supercomputer",   "Machine", 1, 4, 7],
  ["swiss-army-knife","Swiss Army Knife","Machine",4, 4, 4],
  ["bulldozer",     "Bulldozer",       "Machine", 7, 3, 2],
  ["drone",         "Drone",           "Machine", 2, 7, 3],
  ["clockwork-mouse","Clockwork Mouse","Machine", 2, 5, 5],
  ["lockpick",      "Lockpick",        "Machine", 3, 4, 5],

  // Icon (Made)
  ["jimi-hendrix",  "Jimi Hendrix",    "Icon",    1, 4, 7],
  ["teddy-roosevelt","Teddy Roosevelt","Icon",    4, 2, 6],
  ["muhammad-ali",  "Muhammad Ali",    "Icon",    4, 6, 2],
  ["air-force-1s",  "Air Force 1s",   "Icon",    3, 7, 2],
  ["cleopatra",     "Cleopatra",       "Icon",    4, 3, 5],
  ["houdini",       "Houdini",         "Icon",    2, 6, 4],
  ["babe-ruth",     "Babe Ruth",       "Icon",    5, 4, 3],
  ["sherlock-holmes","Sherlock Holmes","Icon",    2, 5, 5],

  // Spirit (Raw)
  ["ghost",         "Ghost",           "Spirit",  2, 5, 5],
  ["wise-elder",    "Wise Elder",      "Spirit",  2, 3, 7],
  ["poltergeist",   "Poltergeist",     "Spirit",  4, 6, 2],
  ["nightmare",     "Nightmare",       "Spirit",  5, 4, 3],
  ["grudge",        "Grudge",          "Spirit",  6, 3, 3],
  ["wanderlust",    "Wanderlust",      "Spirit",  2, 7, 3],
  ["muse",          "Muse",            "Spirit",  1, 4, 7],
  ["echo",          "Echo",            "Spirit",  4, 4, 4],
];

const CARDS = RAW.map(([id, name, trait, power, speed, wits]) => ({
  id,
  name,
  trait,
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
