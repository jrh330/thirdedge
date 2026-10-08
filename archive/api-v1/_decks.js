'use strict';

const { ANCHOR_CARDS } = require('../engine/fixtures');

function byId(id) {
  const card = ANCHOR_CARDS.find((c) => c.id === id);
  if (!card) throw new Error(`Anchor card not found: ${id}`);
  return card;
}

// Deck Alpha — "The Wild"
// Bear(Beast,Smash,P5), Cheetah(Beast,Dodge,S5), Fox(Beast,Trick), Wolf(Beast,Rally),
// Elephant(Beast,Smash,P5), Swiss Army Knife(Machine,Everyman), Teddy Roosevelt(Icon,Rally),
// Muhammad Ali(Icon,Dodge)
// 5-stat cards: Bear(P5), Elephant(P5), Cheetah(S5) = 3 ✓
const DECK_ALPHA = [
  byId('bear'),
  byId('cheetah'),
  byId('fox'),
  byId('wolf'),
  byId('elephant'),
  byId('swiss-army-knife'),
  byId('teddy-roosevelt'),
  byId('muhammad-ali'),
];

// Deck Beta — "The Legends"
// Hulk(Titan,Smash,P5), Jimi Hendrix(Icon,Trick), Ghost(Spirit,Dodge), Platinum(Element,Rally),
// Nutmeg(Element,Trick), Wildfire(Element,Smash), Air Force 1s(Icon,Dodge,S5), Poltergeist(Spirit,Dodge)
// Note: Wise Elder (Spirit,Rally) is invalid for deck use (wits=5 violates Rally gate).
// Replaced with Wildfire (Element,Smash,P4 S4 W1) — no 5-stat card.
// 5-stat cards: Hulk(P5), Air Force 1s(S5) = 2 ✓
const DECK_BETA = [
  byId('hulk'),
  byId('jimi-hendrix'),
  byId('ghost'),
  byId('platinum'),
  byId('nutmeg'),
  byId('wildfire'),
  byId('air-force-1s'),
  byId('poltergeist'),
];

module.exports = { DECK_ALPHA, DECK_BETA };
