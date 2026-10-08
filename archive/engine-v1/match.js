'use strict';

const { validateDeck } = require('./validate');
const { setupGame } = require('./game');

// ---------------------------------------------------------------------------
// createMatch
// ---------------------------------------------------------------------------

/**
 * @param {string} p1Id
 * @param {string} p2Id
 * @param {Card[]} deck1
 * @param {Card[]} deck2
 * @returns {MatchState}
 */
function createMatch(p1Id, p2Id, deck1, deck2) {
  validateDeck(deck1);
  validateDeck(deck2);

  return {
    playerIds: [p1Id, p2Id],
    wins: { [p1Id]: 0, [p2Id]: 0 },
    currentGame: null,
    completedGames: [],
    swaps: [],
    decks: { [p1Id]: [...deck1], [p2Id]: [...deck2] },
    status: 'active',
    winnerId: null,
    abilityRevealed: {},
  };
}

// ---------------------------------------------------------------------------
// startGame
// ---------------------------------------------------------------------------

/**
 * @param {MatchState} matchState
 * @param {string} firstPlayerId
 * @param {object} [opts] - passed to setupGame (e.g. skipShuffle)
 * @returns {MatchState}
 */
function startGame(matchState, firstPlayerId, opts = {}) {
  if (matchState.status === 'complete') {
    throw new Error(`Cannot start a game: match is already complete`);
  }

  const [p1Id, p2Id] = matchState.playerIds;
  const gameIndex = matchState.completedGames.length;

  const gameState = setupGame(
    p1Id,
    p2Id,
    matchState.decks[p1Id],
    matchState.decks[p2Id],
    firstPlayerId,
    gameIndex,
    { ...opts, abilityRevealed: matchState.abilityRevealed }
  );

  return {
    ...matchState,
    currentGame: gameState,
    status: 'active',
  };
}

// ---------------------------------------------------------------------------
// recordGameResult
// ---------------------------------------------------------------------------

/**
 * @param {MatchState} matchState
 * @returns {MatchState}
 */
function recordGameResult(matchState) {
  const { currentGame } = matchState;
  if (!currentGame || currentGame.phase !== 'gameOver') {
    throw new Error(`recordGameResult requires currentGame.phase='gameOver'`);
  }

  const [p1Id, p2Id] = matchState.playerIds;

  // Extract abilityRevealed from all CardInPlay objects in the completed game
  const newRevealed = { ...matchState.abilityRevealed };
  for (const pid of [p1Id, p2Id]) {
    const player = currentGame.players[pid];
    for (const cip of player.team) {
      if (cip.abilityRevealed) {
        newRevealed[cip.card.id] = true;
      }
    }
  }

  let wins = { ...matchState.wins };
  if (currentGame.winnerId) {
    wins[currentGame.winnerId] = (wins[currentGame.winnerId] || 0) + 1;
  }

  const completedGames = [...matchState.completedGames, currentGame];

  // Check if match is complete
  let status = 'postGame';
  let winnerId = null;
  for (const pid of [p1Id, p2Id]) {
    if (wins[pid] >= 2) {
      status = 'complete';
      winnerId = pid;
      break;
    }
  }

  return {
    ...matchState,
    wins,
    currentGame: null,
    completedGames,
    abilityRevealed: newRevealed,
    status,
    winnerId,
  };
}

// ---------------------------------------------------------------------------
// swapCard
// ---------------------------------------------------------------------------

/**
 * @param {MatchState} matchState
 * @param {string} winnerGaveCardId - winner's card → loser's deck
 * @param {string} winnerTookCardId - random from loser → winner's deck
 * @returns {MatchState}
 */
function swapCard(matchState, winnerGaveCardId, winnerTookCardId) {
  if (matchState.status !== 'postGame') {
    throw new Error(`swapCard requires status='postGame', got: ${matchState.status}`);
  }

  // Determine winner/loser from last completed game
  const lastGame = matchState.completedGames[matchState.completedGames.length - 1];
  if (!lastGame) {
    throw new Error(`No completed games to determine winner`);
  }
  const winnerPlayerId = lastGame.winnerId;
  if (!winnerPlayerId) {
    throw new Error(`Last game had no winner (tie), cannot swap`);
  }
  const [p1Id, p2Id] = matchState.playerIds;
  const loserPlayerId = winnerPlayerId === p1Id ? p2Id : p1Id;

  const winnerDeck = matchState.decks[winnerPlayerId];
  const loserDeck = matchState.decks[loserPlayerId];

  // Validate cards are in the correct decks
  const winnerCardIndex = winnerDeck.findIndex((c) => c.id === winnerGaveCardId);
  if (winnerCardIndex === -1) {
    throw new Error(
      `winnerGaveCardId '${winnerGaveCardId}' not found in winner's deck`
    );
  }
  const loserCardIndex = loserDeck.findIndex((c) => c.id === winnerTookCardId);
  if (loserCardIndex === -1) {
    throw new Error(
      `winnerTookCardId '${winnerTookCardId}' not found in loser's deck`
    );
  }

  const winnerCard = winnerDeck[winnerCardIndex];
  const loserCard = loserDeck[loserCardIndex];

  // Perform swap
  const newWinnerDeck = [
    ...winnerDeck.filter((c) => c.id !== winnerGaveCardId),
    loserCard,
  ];
  const newLoserDeck = [
    ...loserDeck.filter((c) => c.id !== winnerTookCardId),
    winnerCard,
  ];

  const swapRecord = {
    afterGameIndex: lastGame.gameIndex,
    winnerPlayerId,
    loserPlayerId,
    winnerGaveCardId,
    winnerTookCardId,
    undone: false,
  };

  return {
    ...matchState,
    decks: {
      ...matchState.decks,
      [winnerPlayerId]: newWinnerDeck,
      [loserPlayerId]: newLoserDeck,
    },
    swaps: [...matchState.swaps, swapRecord],
  };
}

// ---------------------------------------------------------------------------
// reclaimSwap
// ---------------------------------------------------------------------------

/**
 * @param {MatchState} matchState
 * @param {number} swapIndex
 * @returns {MatchState}
 */
function reclaimSwap(matchState, swapIndex) {
  if (matchState.status !== 'postGame') {
    throw new Error(`reclaimSwap requires status='postGame', got: ${matchState.status}`);
  }

  const swap = matchState.swaps[swapIndex];
  if (!swap) {
    throw new Error(`No swap found at index ${swapIndex}`);
  }
  if (swap.undone) {
    throw new Error(`Swap at index ${swapIndex} is already undone`);
  }

  const { winnerPlayerId, loserPlayerId, winnerGaveCardId, winnerTookCardId } = swap;

  // winnerGaveCardId should currently be in loser's deck (winner gave it to loser)
  const loserDeck = matchState.decks[loserPlayerId];
  const winnerDeck = matchState.decks[winnerPlayerId];

  const winnerGaveCardInLoserDeck = loserDeck.find((c) => c.id === winnerGaveCardId);
  if (!winnerGaveCardInLoserDeck) {
    throw new Error(
      `Cannot reclaim swap: winnerGaveCardId '${winnerGaveCardId}' not found in loser's deck`
    );
  }
  // winnerTookCardId should currently be in winner's deck
  const winnerTookCardInWinnerDeck = winnerDeck.find((c) => c.id === winnerTookCardId);
  if (!winnerTookCardInWinnerDeck) {
    throw new Error(
      `Cannot reclaim swap: winnerTookCardId '${winnerTookCardId}' not found in winner's deck`
    );
  }

  // Reverse: move winnerGaveCard back to winner's deck, move winnerTookCard back to loser's deck
  const newWinnerDeck = [
    ...winnerDeck.filter((c) => c.id !== winnerTookCardId),
    winnerGaveCardInLoserDeck,
  ];
  const newLoserDeck = [
    ...loserDeck.filter((c) => c.id !== winnerGaveCardId),
    winnerTookCardInWinnerDeck,
  ];

  const newSwaps = matchState.swaps.map((s, i) =>
    i === swapIndex ? { ...s, undone: true } : s
  );

  return {
    ...matchState,
    decks: {
      ...matchState.decks,
      [winnerPlayerId]: newWinnerDeck,
      [loserPlayerId]: newLoserDeck,
    },
    swaps: newSwaps,
  };
}

// ---------------------------------------------------------------------------
// declinePostGame
// ---------------------------------------------------------------------------

/**
 * @param {MatchState} matchState
 * @returns {MatchState}
 */
function declinePostGame(matchState) {
  if (matchState.status !== 'postGame') {
    throw new Error(`declinePostGame requires status='postGame', got: ${matchState.status}`);
  }
  // No deck changes
  return { ...matchState };
}

// ---------------------------------------------------------------------------
// finalizeMatch
// ---------------------------------------------------------------------------

/**
 * @param {MatchState} matchState
 * @returns {MatchState}
 */
function finalizeMatch(matchState) {
  if (matchState.status !== 'complete') {
    throw new Error(`finalizeMatch requires status='complete', got: ${matchState.status}`);
  }

  let decks = { ...matchState.decks };
  const newSwaps = [...matchState.swaps];

  // For each non-undone swap, reverse it
  for (let i = 0; i < newSwaps.length; i++) {
    if (newSwaps[i].undone) continue;

    const swap = newSwaps[i];
    const { winnerPlayerId, loserPlayerId, winnerGaveCardId, winnerTookCardId } = swap;

    // winnerGaveCard should be in loser's deck (or somewhere after re-swaps)
    // winnerTookCard should be in winner's deck
    const winnerGaveCard = decks[loserPlayerId].find((c) => c.id === winnerGaveCardId);
    const winnerTookCard = decks[winnerPlayerId].find((c) => c.id === winnerTookCardId);

    if (winnerGaveCard && winnerTookCard) {
      decks = {
        ...decks,
        [winnerPlayerId]: [
          ...decks[winnerPlayerId].filter((c) => c.id !== winnerTookCardId),
          winnerGaveCard,
        ],
        [loserPlayerId]: [
          ...decks[loserPlayerId].filter((c) => c.id !== winnerGaveCardId),
          winnerTookCard,
        ],
      };
    }

    newSwaps[i] = { ...swap, undone: true };
  }

  return {
    ...matchState,
    decks,
    swaps: newSwaps,
  };
}

module.exports = {
  createMatch,
  startGame,
  recordGameResult,
  swapCard,
  reclaimSwap,
  declinePostGame,
  finalizeMatch,
};
