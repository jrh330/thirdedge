"use strict";
const {
  createMatch, submitPlayerMove, executeTrade, executeReclaim, declineTrade,
  undoAllTrades, currentRound,
} = require("../match");
const { CARDS, BY_ID } = require("../fixtures");
const { RULE_SET, ROUND_POINTS } = require("../constants");

// 12-card decks with ≤3 sevens each
const deckA = [
  BY_ID["cheetah"], BY_ID["bear"], BY_ID["elephant"],
  BY_ID["fox"], BY_ID["wolf"], BY_ID["honey-badger"], BY_ID["alley-cat"],
  BY_ID["kraken"], BY_ID["frost-giant"], BY_ID["yeti"], BY_ID["troll"], BY_ID["golem"],
];
const deckB = [
  BY_ID["freight-train"], BY_ID["fighter-jet"], BY_ID["jimi-hendrix"],
  BY_ID["swiss-army-knife"], BY_ID["clockwork-mouse"], BY_ID["lockpick"],
  BY_ID["teddy-roosevelt"], BY_ID["muhammad-ali"], BY_ID["cleopatra"],
  BY_ID["houdini"], BY_ID["babe-ruth"], BY_ID["sherlock-holmes"],
];

const A = "player-a";
const B = "player-b";

function makeMatch(opts = {}) {
  return createMatch("match1", A, deckA, B, deckB, RULE_SET.FAMILY_WHEEL, {
    skipShuffle: true, ...opts,
  });
}

/**
 * Force a round win for `winnerId` by patching the current round's points,
 * then update roundsWon and set pendingTrade / winnerId accordingly.
 * Does NOT add a new round — this is intentional to keep the state machine simple.
 */
function forceRoundWin(match, winnerId) {
  const rounds = match.rounds.slice();
  const round = { ...rounds[rounds.length - 1] };
  const winnerIdx = round.players[0].playerId === winnerId ? 0 : 1;
  const newPlayers = round.players.map((p, i) => ({
    ...p, points: i === winnerIdx ? ROUND_POINTS : 0,
  }));
  rounds[rounds.length - 1] = { ...round, players: newPlayers, phase: "over" };

  const updatedWon = { ...match.roundsWon, [winnerId]: match.roundsWon[winnerId] + 1 };
  const loserId = match.playerIds.find(id => id !== winnerId);
  const matchOver = updatedWon[winnerId] >= 2;

  let result = {
    ...match,
    rounds,
    roundsWon: updatedWon,
    pendingTrade: matchOver
      ? null
      : { winner: winnerId, loser: loserId, roundIndex: round.index },
    winnerId: matchOver ? winnerId : null,
  };

  // If match ends, undo all trades (mirroring handleRoundOver in match.js)
  if (matchOver) {
    result = undoAllTrades(result);
  }

  return result;
}

// ── createMatch ──────────────────────────────────────────────────────────────

describe("createMatch", () => {
  test("correct initial state", () => {
    const m = makeMatch();
    expect(m.matchId).toBe("match1");
    expect(m.playerIds).toEqual([A, B]);
    expect(m.roundsWon).toEqual({ [A]: 0, [B]: 0 });
    expect(m.rounds.length).toBe(1);
    expect(currentRound(m).phase).toBe("opening");
    expect(m.winnerId).toBeNull();
  });

  test("rejects deck with wrong card count", () => {
    expect(() => createMatch("m", A, deckA.slice(0, 11), B, deckB, RULE_SET.FAMILY_WHEEL))
      .toThrow(/invalid/i);
  });

  test("rejects deck with too many sevens", () => {
    const badDeck = [
      BY_ID["cheetah"], BY_ID["bear"], BY_ID["elephant"], BY_ID["owl"],  // 4 sevens
      BY_ID["fox"], BY_ID["wolf"], BY_ID["honey-badger"], BY_ID["alley-cat"],
      BY_ID["kraken"], BY_ID["frost-giant"], BY_ID["yeti"], BY_ID["troll"],
    ];
    expect(() => createMatch("m", A, badDeck, B, deckB, RULE_SET.FAMILY_WHEEL))
      .toThrow(/invalid/i);
  });
});

// ── submitPlayerMove ─────────────────────────────────────────────────────────

describe("submitPlayerMove + turn resolution", () => {
  test("opening: advances to commit after both submit", () => {
    let m = makeMatch();
    const aCard = currentRound(m).players[0].hand[0];
    const bCard = currentRound(m).players[1].hand[0];

    m = submitPlayerMove(m, A, aCard, null);
    expect(currentRound(m).phase).toBe("opening");  // only one in

    m = submitPlayerMove(m, B, bCard, null);
    expect(currentRound(m).phase).toBe("commit");
    expect(currentRound(m).players[0].anchor).toBe(aCard);
    expect(currentRound(m).players[1].anchor).toBe(bCard);
  });

  test("normal turn adds history entry after both submit", () => {
    let m = makeMatch();
    m = submitPlayerMove(m, A, currentRound(m).players[0].hand[0], null);
    m = submitPlayerMove(m, B, currentRound(m).players[1].hand[0], null);
    expect(currentRound(m).phase).toBe("commit");

    const r2 = currentRound(m);
    m = submitPlayerMove(m, A, r2.players[0].hand[0], "power");
    expect(currentRound(m).history.length).toBe(0);  // only one in

    m = submitPlayerMove(m, B, r2.players[1].hand[0], "speed");
    expect(currentRound(m).history.length).toBe(1);
  });

  test("only one pending move visible until both are in", () => {
    let m = makeMatch();
    m = submitPlayerMove(m, A, currentRound(m).players[0].hand[0], null);
    expect(Object.keys(currentRound(m).pending).length).toBe(1);
  });
});

// ── Trade ────────────────────────────────────────────────────────────────────

describe("Trade mechanics", () => {
  test("executeTrade: winner gives a card and receives one from loser", () => {
    let m = forceRoundWin(makeMatch(), A);
    const giveCardId = m.decks[A][0];

    m = executeTrade(m, A, giveCardId);

    expect(m.decks[A]).not.toContain(giveCardId);
    expect(m.decks[B]).toContain(giveCardId);
    expect(m.decks[A].length).toBe(12);
    expect(m.decks[B].length).toBe(12);
    expect(m.swaps.length).toBe(1);
    expect(m.swaps[0].gaveCardId).toBe(giveCardId);
    expect(m.swaps[0].by).toBe(A);
    expect(m.swaps[0].undone).toBe(false);
  });

  test("executeTrade: giveCard must be in winner's deck", () => {
    let m = forceRoundWin(makeMatch(), A);
    const bCardId = m.decks[B][0];
    expect(() => executeTrade(m, A, bCardId)).toThrow(/not in winner/i);
  });

  test("only round winner can initiate Trade", () => {
    let m = forceRoundWin(makeMatch(), A);
    expect(() => executeTrade(m, B, m.decks[B][0])).toThrow(/winner/i);
  });

  test("executeReclaim: undoes a previous trade", () => {
    // A wins round 1, trades. Then inject a new pendingTrade for A (simulating A winning round 2
    // without ending the match — valid in a real multi-round extension scenario).
    let m = forceRoundWin(makeMatch(), A);
    const giveCardId = m.decks[A][0];
    m = executeTrade(m, A, giveCardId);
    const tookCardId = m.swaps[0].tookCardId;

    // Inject a pendingTrade for A at round 2 (bypasses match-end for test purposes)
    m = { ...m, pendingTrade: { winner: A, loser: B, roundIndex: 2 } };

    m = executeReclaim(m, A, 0);

    expect(m.decks[A]).toContain(giveCardId);   // gave card returned
    expect(m.decks[B]).toContain(tookCardId);   // took card returned
    expect(m.swaps[0].undone).toBe(true);
    expect(m.decks[A].length).toBe(12);
    expect(m.decks[B].length).toBe(12);
  });

  test("executeReclaim: only own swaps may be reclaimed", () => {
    let m = forceRoundWin(makeMatch(), A);
    m = declineTrade(m, A);
    // Inject a swap initiated by B, and a pendingTrade for A
    m = {
      ...m,
      swaps: [{ by: B, gaveCardId: "x", tookCardId: "y", afterRound: 1, undone: false }],
      pendingTrade: { winner: A, loser: B, roundIndex: 2 },
    };
    expect(() => executeReclaim(m, A, 0)).toThrow(/own trade/i);
  });

  test("declineTrade: proceeds to next round, decks unchanged", () => {
    let m = forceRoundWin(makeMatch(), A);
    const aDeckBefore = m.decks[A].slice().sort();
    const bDeckBefore = m.decks[B].slice().sort();

    m = declineTrade(m, A);

    expect(m.swaps.length).toBe(0);
    expect(m.decks[A].slice().sort()).toEqual(aDeckBefore);
    expect(m.decks[B].slice().sort()).toEqual(bDeckBefore);
  });
});

// ── undoAllTrades ─────────────────────────────────────────────────────────────

describe("undoAllTrades", () => {
  test("decks restored to original after one trade", () => {
    let m = makeMatch();
    const origA = m.decks[A].slice().sort();
    const origB = m.decks[B].slice().sort();

    m = forceRoundWin(m, A);
    m = executeTrade(m, A, m.decks[A][0]);

    // Decks are different post-trade
    expect(m.decks[A].slice().sort()).not.toEqual(origA);

    m = undoAllTrades(m);

    expect(m.decks[A].slice().sort()).toEqual(origA);
    expect(m.decks[B].slice().sort()).toEqual(origB);
    expect(m.swaps.every(s => s.undone)).toBe(true);
  });

  test("decks restored to original after two trades", () => {
    let m = makeMatch();
    const origA = m.decks[A].slice().sort();
    const origB = m.decks[B].slice().sort();

    // Trade 1: A gives card #0
    m = forceRoundWin(m, A);
    m = executeTrade(m, A, m.decks[A][0]);

    // Trade 2: inject a second pendingTrade for A and trade another card
    m = { ...m, pendingTrade: { winner: A, loser: B, roundIndex: 2 } };
    m = executeTrade(m, A, m.decks[A][0]);

    expect(m.swaps.length).toBe(2);

    m = undoAllTrades(m);

    expect(m.decks[A].slice().sort()).toEqual(origA);
    expect(m.decks[B].slice().sort()).toEqual(origB);
    expect(m.swaps.every(s => s.undone)).toBe(true);
  });
});

// ── Match completion ──────────────────────────────────────────────────────────

describe("match completion", () => {
  test("match ends when a player wins 2 rounds", () => {
    let m = makeMatch();
    expect(m.winnerId).toBeNull();

    m = forceRoundWin(m, A);
    m = declineTrade(m, A);
    expect(m.winnerId).toBeNull();

    m = forceRoundWin(m, A);
    expect(m.winnerId).toBe(A);
    expect(m.pendingTrade).toBeNull();
  });

  test("all trades undone when match ends (via forceRoundWin which calls undoAllTrades)", () => {
    let m = makeMatch();
    const origA = m.decks[A].slice().sort();
    const origB = m.decks[B].slice().sort();

    // A wins round 1, trades
    m = forceRoundWin(m, A);
    m = executeTrade(m, A, m.decks[A][0]);

    // A wins round 2 → match over → forceRoundWin calls undoAllTrades
    m = forceRoundWin(m, A);

    expect(m.winnerId).toBe(A);
    // Decks restored
    expect(m.decks[A].slice().sort()).toEqual(origA);
    expect(m.decks[B].slice().sort()).toEqual(origB);
  });
});
