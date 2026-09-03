"use strict";
const { setupRound, submitMove, revealAndAdvance, roundWinner, checkRoundEnd } = require("../round");
const { CARDS, BY_ID } = require("../fixtures");
const { HAND_SIZE, ROUND_POINTS, STAKE_CAP, RULE_SET } = require("../constants");

const cardById = id => {
  const c = BY_ID[id];
  if (!c) throw new Error(`Unknown card: ${id}`);
  return c;
};

// 12-card decks with ≤3 sevens each
// Deck A (Living): 3 sevens (cheetah S7, bear P7, elephant P7) + 9 non-sevens
const deckA = [
  BY_ID["cheetah"], BY_ID["bear"], BY_ID["elephant"],           // 3 sevens
  BY_ID["fox"], BY_ID["wolf"], BY_ID["honey-badger"], BY_ID["alley-cat"],  // 0 sevens
  BY_ID["kraken"], BY_ID["frost-giant"], BY_ID["yeti"], BY_ID["troll"], BY_ID["golem"],   // 0 sevens
];

// Deck B (Made): 3 sevens (freight-train P7, fighter-jet S7, jimi-hendrix W7) + 9 non-sevens
const deckB = [
  BY_ID["freight-train"], BY_ID["fighter-jet"], BY_ID["jimi-hendrix"],  // 3 sevens
  BY_ID["swiss-army-knife"], BY_ID["clockwork-mouse"], BY_ID["lockpick"],  // 0 sevens Machine
  BY_ID["teddy-roosevelt"], BY_ID["muhammad-ali"], BY_ID["cleopatra"],
  BY_ID["houdini"], BY_ID["babe-ruth"], BY_ID["sherlock-holmes"],      // 0 sevens Icon
];

describe("setupRound", () => {
  test("creates opening phase with correct hand sizes", () => {
    const round = setupRound(1, "a", deckA, "b", deckB, { skipShuffle: true });
    expect(round.phase).toBe("opening");
    expect(round.players[0].hand.length).toBe(HAND_SIZE);
    expect(round.players[1].hand.length).toBe(HAND_SIZE);
    expect(round.players[0].draw.length).toBe(12 - HAND_SIZE);
    expect(round.players[1].draw.length).toBe(12 - HAND_SIZE);
    expect(round.players[0].anchor).toBeNull();
    expect(round.players[1].anchor).toBeNull();
    expect(round.stake).toBe(1);
    expect(round.pending).toEqual({});
  });

  test("hand contains card ids (strings), not objects", () => {
    const round = setupRound(1, "a", deckA, "b", deckB, { skipShuffle: true });
    expect(typeof round.players[0].hand[0]).toBe("string");
    expect(typeof round.players[0].draw[0]).toBe("string");
  });
});

describe("submitMove", () => {
  let round;
  beforeEach(() => {
    round = setupRound(1, "a", deckA, "b", deckB, { skipShuffle: true });
  });

  test("opening: submits a card with null category", () => {
    const cardId = round.players[0].hand[0];
    const r = submitMove(round, "a", cardId, null, cardById);
    expect(r.pending["a"]).toEqual({ cardId, category: null });
  });

  test("opening: rejects non-null category", () => {
    const cardId = round.players[0].hand[0];
    expect(() => submitMove(round, "a", cardId, "power", cardById)).toThrow(/null/);
  });

  test("opening: rejects card not in hand", () => {
    const notInHand = deckA[11].id;
    expect(() => submitMove(round, "a", notInHand, null, cardById)).toThrow(/not in/);
  });

  test("commit phase: rejects null category", () => {
    let r = submitMove(round, "a", round.players[0].hand[0], null, cardById);
    r = submitMove(r, "b", r.players[1].hand[0], null, cardById);
    const { round: committed } = revealAndAdvance(r, cardById, RULE_SET.FAMILY_WHEEL);
    expect(committed.phase).toBe("commit");
    const cardId = committed.players[0].hand[0];
    expect(() => submitMove(committed, "a", cardId, null, cardById)).toThrow(/null/i);
  });

  test("rejects card from wrong player", () => {
    const bCardId = round.players[1].hand[0];
    expect(() => submitMove(round, "a", bCardId, null, cardById)).toThrow(/not in/);
  });
});

describe("revealAndAdvance — opening turn", () => {
  test("opening cards become anchors, phase moves to commit, hands draw back up", () => {
    let round = setupRound(1, "a", deckA, "b", deckB, { skipShuffle: true });
    const aCard = round.players[0].hand[0];
    const bCard = round.players[1].hand[0];

    round = submitMove(round, "a", aCard, null, cardById);
    round = submitMove(round, "b", bCard, null, cardById);

    const { round: next, result } = revealAndAdvance(round, cardById, RULE_SET.FAMILY_WHEEL);
    expect(result).toBeNull();       // no scoring on opening
    expect(next.phase).toBe("commit");
    expect(next.players[0].anchor).toBe(aCard);
    expect(next.players[1].anchor).toBe(bCard);
    expect(next.players[0].hand.length).toBe(HAND_SIZE);
    expect(next.players[1].hand.length).toBe(HAND_SIZE);
    expect(next.pending).toEqual({});
  });
});

describe("revealAndAdvance — normal turns", () => {
  function playOpening() {
    let round = setupRound(1, "a", deckA, "b", deckB, { skipShuffle: true });
    round = submitMove(round, "a", round.players[0].hand[0], null, cardById);
    round = submitMove(round, "b", round.players[1].hand[0], null, cardById);
    const { round: next } = revealAndAdvance(round, cardById, RULE_SET.FAMILY_WHEEL);
    return next;
  }

  test("slide: played card becomes new anchor, old anchor goes to discard", () => {
    let round = playOpening();
    const oldAnchorA = round.players[0].anchor;
    const playedA    = round.players[0].hand[0];
    const playedB    = round.players[1].hand[0];

    round = submitMove(round, "a", playedA, "power", cardById);
    round = submitMove(round, "b", playedB, "speed", cardById);
    const { round: next } = revealAndAdvance(round, cardById, RULE_SET.FAMILY_WHEEL);

    expect(next.players[0].anchor).toBe(playedA);
    expect(next.players[0].discard).toContain(oldAnchorA);
  });

  test("winner gets stake points; stake resets to 1", () => {
    let round = playOpening();
    const playedA = round.players[0].hand[0];
    const playedB = round.players[1].hand[0];
    round = submitMove(round, "a", playedA, "power", cardById);
    round = submitMove(round, "b", playedB, "wits",  cardById);
    const { round: next, result } = revealAndAdvance(round, cardById, RULE_SET.FAMILY_WHEEL);

    if (result && result.winner !== null) {
      expect(next.stake).toBe(1);
      const winnerIdx = next.players[0].playerId === result.winner ? 0 : 1;
      // Wait - result.winner is "a" or "b", not a playerId
      const winnersPoints = result.winner === "a" ? next.players[0].points : next.players[1].points;
      expect(winnersPoints).toBeGreaterThan(0);
    }
  });

  test("history grows by 1 after each normal turn", () => {
    let round = playOpening();
    expect(round.history.length).toBe(0);

    round = submitMove(round, "a", round.players[0].hand[0], "power", cardById);
    round = submitMove(round, "b", round.players[1].hand[0], "speed", cardById);
    const { round: next } = revealAndAdvance(round, cardById, RULE_SET.FAMILY_WHEEL);
    expect(next.history.length).toBe(1);
  });

  test("tie increments stake; stake capped at STAKE_CAP", () => {
    // Force a tie by using swiss-army-knife for both sides and same category
    const sak = BY_ID["swiss-army-knife"];
    const uniformCards = Array.from({ length: 12 }, (_, i) => ({ ...sak, id: `sak-${i}` }));
    const uniformCardById = id => uniformCards.find(c => c.id === id);

    let round = setupRound(1, "a", uniformCards, "b", uniformCards, { skipShuffle: true });
    // Opening
    round = submitMove(round, "a", uniformCards[0].id, null, uniformCardById);
    round = submitMove(round, "b", uniformCards[1].id, null, uniformCardById);
    const { round: committed } = revealAndAdvance(round, uniformCardById, RULE_SET.FAMILY_WHEEL);

    // Patch anchors so both sides have the same card and attack same category
    const patchedRound = {
      ...committed,
      players: [
        { ...committed.players[0], anchor: uniformCards[0].id, hand: [uniformCards[2].id] },
        { ...committed.players[1], anchor: uniformCards[1].id, hand: [uniformCards[3].id] },
      ],
    };
    let r = submitMove(patchedRound, "a", uniformCards[2].id, "power", uniformCardById);
    r     = submitMove(r,           "b", uniformCards[3].id, "power", uniformCardById);
    const { round: afterTie, result } = revealAndAdvance(r, uniformCardById, RULE_SET.FAMILY_WHEEL);

    expect(result.decidedBy).toBe("tie");
    expect(afterTie.stake).toBe(2);

    // Test cap: feed stake = STAKE_CAP into another tie
    const atCap = { ...afterTie, stake: STAKE_CAP,
      players: [
        { ...afterTie.players[0], hand: [uniformCards[4].id] },
        { ...afterTie.players[1], hand: [uniformCards[5].id] },
      ],
    };
    let r2 = submitMove(atCap, "a", uniformCards[4].id, "power", uniformCardById);
    r2     = submitMove(r2,    "b", uniformCards[5].id, "power", uniformCardById);
    const { round: afterCap } = revealAndAdvance(r2, uniformCardById, RULE_SET.FAMILY_WHEEL);
    expect(afterCap.stake).toBe(STAKE_CAP);
  });
});

describe("checkRoundEnd", () => {
  const basePlayer = {
    playerId: "x", draw: [], hand: ["a"], anchor: null, discard: [], points: 0,
  };

  test("in-progress → commit", () => {
    const players = [{ ...basePlayer, points: 2 }, { ...basePlayer, points: 1 }];
    expect(checkRoundEnd(players, 1).phase).toBe("commit");
  });

  test("player reaches ROUND_POINTS → over", () => {
    const players = [{ ...basePlayer, points: ROUND_POINTS }, { ...basePlayer, points: 1 }];
    expect(checkRoundEnd(players, 1).phase).toBe("over");
  });

  test("exhaustion guard: out of cards + tied scores → exhausted-tied", () => {
    const players = [
      { ...basePlayer, hand: [], points: 2 },
      { ...basePlayer, hand: [], points: 2 },
    ];
    expect(checkRoundEnd(players, 1).phase).toBe("exhausted-tied");
  });

  test("exhaustion guard: out of cards + uneven scores → over", () => {
    const players = [
      { ...basePlayer, hand: [], points: 2 },
      { ...basePlayer, hand: [], points: 1 },
    ];
    expect(checkRoundEnd(players, 1).phase).toBe("over");
  });
});
