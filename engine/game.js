'use strict';

const {
  OPENING_HAND,
  GOAL_POINTS,
  GUARD_BONUS,
  BOND_BONUS,
  SMASH_BONUS,
  STATS,
} = require('./constants');
const { recomputeBonds, getTeamTotal } = require('./bonds');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fisher-Yates shuffle — returns NEW array.
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a blank CardInPlay from a Card object.
 */
function makeCardInPlay(card, recruitOrder, abilityRevealed = false) {
  return {
    card,
    abilityUsed: false,
    abilityRevealed,
    bondPartnerId: null,
    rallyBonus: 0,
    knockedOut: false,
    recruitOrder,
  };
}

/**
 * Find a CardInPlay by card id in a team array.
 */
function findCIP(team, cardId) {
  return team.find((cip) => cip.card.id === cardId) || null;
}

/**
 * Replace a CardInPlay in a team array (by card.id), returning new array.
 */
function replaceCIP(team, updated) {
  return team.map((cip) => (cip.card.id === updated.card.id ? updated : cip));
}

// ---------------------------------------------------------------------------
// setupGame
// ---------------------------------------------------------------------------

/**
 * @param {string} p1Id
 * @param {string} p2Id
 * @param {Card[]} deck1
 * @param {Card[]} deck2
 * @param {string} firstPlayerId
 * @param {number} gameIndex
 * @param {object} [opts]
 * @param {boolean} [opts.skipShuffle] - skip Fisher-Yates (for test determinism)
 * @param {object} [opts.abilityRevealed] - map of { [cardId]: boolean } from match state
 * @returns {GameState}
 */
function setupGame(p1Id, p2Id, deck1, deck2, firstPlayerId, gameIndex, opts = {}) {
  const { skipShuffle = false, abilityRevealed: revealedMap = {} } = opts;

  const shuffled1 = skipShuffle ? [...deck1] : shuffle(deck1);
  const shuffled2 = skipShuffle ? [...deck2] : shuffle(deck2);

  // Deal OPENING_HAND cards
  const hand1 = shuffled1.slice(0, OPENING_HAND);
  const remainingDeck1 = shuffled1.slice(OPENING_HAND);
  const hand2 = shuffled2.slice(0, OPENING_HAND);
  const remainingDeck2 = shuffled2.slice(OPENING_HAND);

  const p2Id_ = p2Id; // keep for closure

  return {
    gameIndex,
    phase: 'opening',
    playerIds: [p1Id, p2Id_],
    firstPlayerId,
    players: {
      [p1Id]: { playerId: p1Id, deck: remainingDeck1, hand: hand1, team: [] },
      [p2Id_]: { playerId: p2Id_, deck: remainingDeck2, hand: hand2, team: [] },
    },
    activePlayerId: firstPlayerId,
    consecutivePasses: 0,
    challenge: null,
    rallyPending: null,
    rallyQueue: [],
    openingPicks: { [p1Id]: null, [p2Id_]: null },
    winnerId: null,
    winReason: null,
    recruitCounter: 0,
    _abilityRevealedMap: revealedMap,
  };
}

// ---------------------------------------------------------------------------
// checkWinConditions — internal
// ---------------------------------------------------------------------------

/**
 * Returns { winnerId, winReason } or null.
 */
function checkWinConditions(gameState) {
  const { playerIds, players } = gameState;
  const [p1Id, p2Id] = playerIds;

  // Goal: team total >= GOAL_POINTS
  for (const pid of playerIds) {
    const total = getTeamTotal(players[pid].team);
    if (total >= GOAL_POINTS) {
      return { winnerId: pid, winReason: 'goal' };
    }
  }

  // Elimination: no cards anywhere (deck + hand + standing team all empty)
  for (const pid of playerIds) {
    const opponentId = pid === p1Id ? p2Id : p1Id;
    const p = players[pid];
    const standingTeam = p.team.filter((cip) => !cip.knockedOut);
    const totalCards = p.deck.length + p.hand.length + standingTeam.length;
    if (totalCards === 0) {
      return { winnerId: opponentId, winReason: 'elimination' };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// advanceTurn — internal
// ---------------------------------------------------------------------------

/**
 * Flip activePlayerId, draw a card for the new active player.
 * Returns new GameState.
 */
function advanceTurn(gameState) {
  const { playerIds, activePlayerId, players } = gameState;
  const [p1Id, p2Id] = playerIds;
  const nextPlayerId = activePlayerId === p1Id ? p2Id : p1Id;
  const nextPlayer = players[nextPlayerId];

  // Draw: move deck[0] to hand if deck non-empty
  let newDeck = nextPlayer.deck;
  let newHand = nextPlayer.hand;
  if (newDeck.length > 0) {
    newHand = [...newHand, newDeck[0]];
    newDeck = newDeck.slice(1);
  }

  return {
    ...gameState,
    phase: 'turn',
    activePlayerId: nextPlayerId,
    players: {
      ...players,
      [nextPlayerId]: { ...nextPlayer, deck: newDeck, hand: newHand },
    },
  };
}

// ---------------------------------------------------------------------------
// processRallyQueue — internal
// ---------------------------------------------------------------------------

/**
 * If rallyQueue is non-empty, shift first item to rallyPending and set phase='rallyPending'.
 * Otherwise check wins and advance turn (or set game over).
 * Returns new GameState.
 */
function processRallyQueue(gameState) {
  if (gameState.rallyQueue.length > 0) {
    const [next, ...rest] = gameState.rallyQueue;
    return {
      ...gameState,
      phase: 'rallyPending',
      rallyPending: next,
      rallyQueue: rest,
    };
  }

  // No rally pending — check wins then advance
  const winResult = checkWinConditions(gameState);
  if (winResult) {
    return {
      ...gameState,
      phase: 'gameOver',
      winnerId: winResult.winnerId,
      winReason: winResult.winReason,
    };
  }

  return advanceTurn(gameState);
}

// ---------------------------------------------------------------------------
// submitOpeningPick
// ---------------------------------------------------------------------------

/**
 * @param {GameState} gameState
 * @param {string} playerId
 * @param {string} cardId
 * @returns {GameState}
 */
function submitOpeningPick(gameState, playerId, cardId) {
  if (gameState.phase !== 'opening') {
    throw new Error(`submitOpeningPick requires phase='opening', got: ${gameState.phase}`);
  }
  if (!gameState.playerIds.includes(playerId)) {
    throw new Error(`Unknown playerId: ${playerId}`);
  }
  if (gameState.openingPicks[playerId] !== null) {
    throw new Error(`Player ${playerId} has already submitted an opening pick`);
  }

  const player = gameState.players[playerId];
  const cardInHand = player.hand.find((c) => c.id === cardId);
  if (!cardInHand) {
    throw new Error(`Card '${cardId}' is not in player ${playerId}'s hand`);
  }

  // Record the pick
  let gs = {
    ...gameState,
    openingPicks: { ...gameState.openingPicks, [playerId]: cardId },
  };

  const [p1Id, p2Id] = gs.playerIds;
  const bothPicked = gs.openingPicks[p1Id] !== null && gs.openingPicks[p2Id] !== null;

  if (!bothPicked) {
    return gs;
  }

  // Both picks submitted — resolve opening
  const pick1Id = gs.openingPicks[p1Id];
  const pick2Id = gs.openingPicks[p2Id];

  const revMap = gs._abilityRevealedMap || {};

  // Build CardInPlay for each opening card
  // p1's card gets recruitOrder=0, p2's gets recruitOrder=1
  let counter = gs.recruitCounter;
  const cipP1 = makeCardInPlay(
    gs.players[p1Id].hand.find((c) => c.id === pick1Id),
    counter,
    revMap[pick1Id] || false
  );
  counter++;
  const cipP2 = makeCardInPlay(
    gs.players[p2Id].hand.find((c) => c.id === pick2Id),
    counter,
    revMap[pick2Id] || false
  );
  counter++;

  // Remove from hands
  const newHand1 = gs.players[p1Id].hand.filter((c) => c.id !== pick1Id);
  const newHand2 = gs.players[p2Id].hand.filter((c) => c.id !== pick2Id);

  // Add to teams (no bonds possible with 1 card each, but run recomputeBonds for consistency)
  const team1 = recomputeBonds([cipP1]);
  const team2 = recomputeBonds([cipP2]);

  gs = {
    ...gs,
    recruitCounter: counter,
    players: {
      [p1Id]: { ...gs.players[p1Id], hand: newHand1, team: team1 },
      [p2Id]: { ...gs.players[p2Id], hand: newHand2, team: team2 },
    },
  };

  // Check for Rally cards — push to rallyQueue (p1 first if both have Rally)
  let rallyQueue = [...gs.rallyQueue];
  const card1 = team1[0].card;
  const card2 = team2[0].card;

  if (card1.ability === 'Rally') {
    rallyQueue.push({ playerId: p1Id, cardId: pick1Id });
  }
  if (card2.ability === 'Rally') {
    rallyQueue.push({ playerId: p2Id, cardId: pick2Id });
  }

  gs = { ...gs, rallyQueue };

  // If rally queue non-empty, go to rallyPending
  if (gs.rallyQueue.length > 0) {
    const [next, ...rest] = gs.rallyQueue;
    return {
      ...gs,
      phase: 'rallyPending',
      rallyPending: next,
      rallyQueue: rest,
    };
  }

  // No rally — check wins
  const winResult = checkWinConditions(gs);
  if (winResult) {
    return {
      ...gs,
      phase: 'gameOver',
      winnerId: winResult.winnerId,
      winReason: winResult.winReason,
    };
  }

  // Transition to turn: set activePlayerId=firstPlayerId, apply draw for firstPlayerId
  const fp = gs.firstPlayerId;
  const fpPlayer = gs.players[fp];
  let newDeck = fpPlayer.deck;
  let newHand = fpPlayer.hand;
  if (newDeck.length > 0) {
    newHand = [...newHand, newDeck[0]];
    newDeck = newDeck.slice(1);
  }

  return {
    ...gs,
    phase: 'turn',
    activePlayerId: fp,
    players: {
      ...gs.players,
      [fp]: { ...fpPlayer, deck: newDeck, hand: newHand },
    },
  };
}

// ---------------------------------------------------------------------------
// fireRally
// ---------------------------------------------------------------------------

/**
 * @param {GameState} gameState
 * @param {string|null} targetCardId - null only if no other standing team cards
 * @returns {GameState}
 */
function fireRally(gameState, targetCardId) {
  if (gameState.phase !== 'rallyPending') {
    throw new Error(`fireRally requires phase='rallyPending', got: ${gameState.phase}`);
  }
  const { rallyPending, players } = gameState;
  const { playerId, cardId: rallyCardId } = rallyPending;

  const rallyPlayer = players[playerId];
  const rallyCIP = findCIP(rallyPlayer.team, rallyCardId);
  if (!rallyCIP) {
    throw new Error(`Rally card '${rallyCardId}' not found on player ${playerId}'s team`);
  }

  // Standing team cards OTHER than the rally card
  const otherStanding = rallyPlayer.team.filter(
    (cip) => !cip.knockedOut && cip.card.id !== rallyCardId
  );

  if (targetCardId === null) {
    // Fire with no effect — only valid if no other standing cards
    if (otherStanding.length > 0) {
      throw new Error(
        `targetCardId may only be null if player has no other standing team cards`
      );
    }
  } else {
    // Validate target
    const targetCIP = findCIP(rallyPlayer.team, targetCardId);
    if (!targetCIP) {
      throw new Error(`Target card '${targetCardId}' not found on player ${playerId}'s team`);
    }
    if (targetCIP.knockedOut) {
      throw new Error(`Target card '${targetCardId}' is knocked out`);
    }
    if (targetCardId === rallyCardId) {
      throw new Error(`Rally card cannot target itself`);
    }
  }

  // Mark rally card as used/revealed
  let newTeam = replaceCIP(rallyPlayer.team, {
    ...rallyCIP,
    abilityUsed: true,
    abilityRevealed: true,
  });

  // Apply rally bonus to target
  if (targetCardId !== null) {
    const targetCIP = findCIP(newTeam, targetCardId);
    newTeam = replaceCIP(newTeam, {
      ...targetCIP,
      rallyBonus: (targetCIP.rallyBonus || 0) + 1,
    });
  }

  let gs = {
    ...gameState,
    rallyPending: null,
    players: {
      ...players,
      [playerId]: { ...rallyPlayer, team: newTeam },
    },
  };

  return processRallyQueue(gs);
}

// ---------------------------------------------------------------------------
// declineRally
// ---------------------------------------------------------------------------

/**
 * @param {GameState} gameState
 * @returns {GameState}
 */
function declineRally(gameState) {
  if (gameState.phase !== 'rallyPending') {
    throw new Error(`declineRally requires phase='rallyPending', got: ${gameState.phase}`);
  }

  const gs = {
    ...gameState,
    rallyPending: null,
  };

  return processRallyQueue(gs);
}

// ---------------------------------------------------------------------------
// recruit
// ---------------------------------------------------------------------------

/**
 * @param {GameState} gameState
 * @param {string} cardId
 * @returns {GameState}
 */
function recruit(gameState, cardId) {
  if (gameState.phase !== 'turn') {
    throw new Error(`recruit requires phase='turn', got: ${gameState.phase}`);
  }

  const { activePlayerId, players } = gameState;
  const activePlayer = players[activePlayerId];
  const cardInHand = activePlayer.hand.find((c) => c.id === cardId);
  if (!cardInHand) {
    throw new Error(`Card '${cardId}' is not in player ${activePlayerId}'s hand`);
  }

  const revMap = gameState._abilityRevealedMap || {};
  const counter = gameState.recruitCounter + 1;
  const newCIP = makeCardInPlay(cardInHand, counter, revMap[cardId] || false);

  // Remove from hand, add to team
  const newHand = activePlayer.hand.filter((c) => c.id !== cardId);
  const newTeamRaw = [...activePlayer.team, newCIP];
  const newTeam = recomputeBonds(newTeamRaw);

  let rallyQueue = [...gameState.rallyQueue];
  if (cardInHand.ability === 'Rally') {
    rallyQueue.push({ playerId: activePlayerId, cardId });
  }

  let gs = {
    ...gameState,
    recruitCounter: counter,
    consecutivePasses: 0,
    players: {
      ...players,
      [activePlayerId]: { ...activePlayer, hand: newHand, team: newTeam },
    },
    rallyQueue,
  };

  // If rally in queue, go to rallyPending
  if (gs.rallyQueue.length > 0) {
    const [next, ...rest] = gs.rallyQueue;
    return {
      ...gs,
      phase: 'rallyPending',
      rallyPending: next,
      rallyQueue: rest,
    };
  }

  // Check wins
  const winResult = checkWinConditions(gs);
  if (winResult) {
    return {
      ...gs,
      phase: 'gameOver',
      winnerId: winResult.winnerId,
      winReason: winResult.winReason,
    };
  }

  return advanceTurn(gs);
}

// ---------------------------------------------------------------------------
// initiateChallenge
// ---------------------------------------------------------------------------

/**
 * @param {GameState} gameState
 * @param {string} attackerCardId
 * @param {string} defenderCardId
 * @returns {GameState}
 */
function initiateChallenge(gameState, attackerCardId, defenderCardId) {
  if (gameState.phase !== 'turn') {
    throw new Error(`initiateChallenge requires phase='turn', got: ${gameState.phase}`);
  }

  const { activePlayerId, playerIds, players } = gameState;
  const [p1Id, p2Id] = playerIds;
  const opponentId = activePlayerId === p1Id ? p2Id : p1Id;

  const attackerTeam = players[activePlayerId].team;
  const defenderTeam = players[opponentId].team;

  const attackerCIP = findCIP(attackerTeam, attackerCardId);
  if (!attackerCIP) {
    throw new Error(
      `Attacker card '${attackerCardId}' not found on active player's team`
    );
  }
  if (attackerCIP.knockedOut) {
    throw new Error(`Attacker card '${attackerCardId}' is knocked out`);
  }

  const defenderCIP = findCIP(defenderTeam, defenderCardId);
  if (!defenderCIP) {
    throw new Error(
      `Defender card '${defenderCardId}' not found on opponent's team`
    );
  }
  if (defenderCIP.knockedOut) {
    throw new Error(`Defender card '${defenderCardId}' is knocked out`);
  }

  const challenge = {
    attackerPlayerId: activePlayerId,
    defenderPlayerId: opponentId,
    attackerCardId,
    defenderCardId,
    attackerStat: null,
    guardedStat: null,
    step: 'picking',
    smashApplied: { attacker: false, defender: false },
    trickedToStat: null,
    knockedOutCardId: null,
    knockedOutPlayerId: null,
  };

  return {
    ...gameState,
    phase: 'challenge',
    challenge,
  };
}

// ---------------------------------------------------------------------------
// submitAttackStat / submitGuardStat
// ---------------------------------------------------------------------------

function submitAttackStat(gameState, stat) {
  if (gameState.phase !== 'challenge') {
    throw new Error(`submitAttackStat requires phase='challenge'`);
  }
  if (gameState.challenge.step !== 'picking') {
    throw new Error(`submitAttackStat requires step='picking', got: ${gameState.challenge.step}`);
  }
  if (!STATS.includes(stat)) {
    throw new Error(`Invalid stat '${stat}'. Must be one of: ${STATS.join(', ')}`);
  }

  const challenge = { ...gameState.challenge, attackerStat: stat };
  const step =
    challenge.guardedStat !== null ? 'defenderWindow' : challenge.step;

  return {
    ...gameState,
    challenge: { ...challenge, step },
  };
}

function submitGuardStat(gameState, stat) {
  if (gameState.phase !== 'challenge') {
    throw new Error(`submitGuardStat requires phase='challenge'`);
  }
  if (gameState.challenge.step !== 'picking') {
    throw new Error(`submitGuardStat requires step='picking', got: ${gameState.challenge.step}`);
  }
  if (!STATS.includes(stat)) {
    throw new Error(`Invalid stat '${stat}'. Must be one of: ${STATS.join(', ')}`);
  }

  const challenge = { ...gameState.challenge, guardedStat: stat };
  const step =
    challenge.attackerStat !== null ? 'defenderWindow' : challenge.step;

  return {
    ...gameState,
    challenge: { ...challenge, step },
  };
}

// ---------------------------------------------------------------------------
// Defender ability windows
// ---------------------------------------------------------------------------

function fireDefenderTrick(gameState, newStat) {
  if (gameState.phase !== 'challenge') {
    throw new Error(`fireDefenderTrick requires phase='challenge'`);
  }
  if (gameState.challenge.step !== 'defenderWindow') {
    throw new Error(
      `fireDefenderTrick requires step='defenderWindow', got: ${gameState.challenge.step}`
    );
  }
  if (!STATS.includes(newStat)) {
    throw new Error(`Invalid stat '${newStat}'`);
  }

  const { challenge, players } = gameState;
  const defenderTeam = players[challenge.defenderPlayerId].team;
  const defenderCIP = findCIP(defenderTeam, challenge.defenderCardId);

  if (!defenderCIP || defenderCIP.card.ability !== 'Trick') {
    throw new Error(`Defender card does not have Trick ability`);
  }
  if (defenderCIP.abilityUsed) {
    throw new Error(`Defender Trick ability already used`);
  }
  if (defenderCIP.card.wits < 4) {
    throw new Error(`Trick requires wits >= 4`);
  }

  const updatedDefender = {
    ...defenderCIP,
    abilityUsed: true,
    abilityRevealed: true,
  };
  const newTeam = replaceCIP(defenderTeam, updatedDefender);

  return {
    ...gameState,
    challenge: {
      ...challenge,
      trickedToStat: newStat,
      step: 'attackerWindow',
    },
    players: {
      ...players,
      [challenge.defenderPlayerId]: {
        ...players[challenge.defenderPlayerId],
        team: newTeam,
      },
    },
  };
}

function fireDefenderSmash(gameState) {
  if (gameState.phase !== 'challenge') {
    throw new Error(`fireDefenderSmash requires phase='challenge'`);
  }
  if (gameState.challenge.step !== 'defenderWindow') {
    throw new Error(
      `fireDefenderSmash requires step='defenderWindow', got: ${gameState.challenge.step}`
    );
  }

  const { challenge, players } = gameState;
  const defenderTeam = players[challenge.defenderPlayerId].team;
  const defenderCIP = findCIP(defenderTeam, challenge.defenderCardId);

  if (!defenderCIP || defenderCIP.card.ability !== 'Smash') {
    throw new Error(`Defender card does not have Smash ability`);
  }
  if (defenderCIP.abilityUsed) {
    throw new Error(`Defender Smash ability already used`);
  }
  if (defenderCIP.card.power < 4) {
    throw new Error(`Smash requires power >= 4`);
  }

  const updatedDefender = {
    ...defenderCIP,
    abilityUsed: true,
    abilityRevealed: true,
  };
  const newTeam = replaceCIP(defenderTeam, updatedDefender);

  return {
    ...gameState,
    challenge: {
      ...challenge,
      smashApplied: { ...challenge.smashApplied, defender: true },
      step: 'attackerWindow',
    },
    players: {
      ...players,
      [challenge.defenderPlayerId]: {
        ...players[challenge.defenderPlayerId],
        team: newTeam,
      },
    },
  };
}

function declineDefenderAbility(gameState) {
  if (gameState.phase !== 'challenge') {
    throw new Error(`declineDefenderAbility requires phase='challenge'`);
  }
  if (gameState.challenge.step !== 'defenderWindow') {
    throw new Error(
      `declineDefenderAbility requires step='defenderWindow', got: ${gameState.challenge.step}`
    );
  }

  return {
    ...gameState,
    challenge: { ...gameState.challenge, step: 'attackerWindow' },
  };
}

// ---------------------------------------------------------------------------
// Attacker ability windows
// ---------------------------------------------------------------------------

function fireAttackerSmash(gameState) {
  if (gameState.phase !== 'challenge') {
    throw new Error(`fireAttackerSmash requires phase='challenge'`);
  }
  if (gameState.challenge.step !== 'attackerWindow') {
    throw new Error(
      `fireAttackerSmash requires step='attackerWindow', got: ${gameState.challenge.step}`
    );
  }

  const { challenge, players } = gameState;
  const attackerTeam = players[challenge.attackerPlayerId].team;
  const attackerCIP = findCIP(attackerTeam, challenge.attackerCardId);

  if (!attackerCIP || attackerCIP.card.ability !== 'Smash') {
    throw new Error(`Attacker card does not have Smash ability`);
  }
  if (attackerCIP.abilityUsed) {
    throw new Error(`Attacker Smash ability already used`);
  }
  if (attackerCIP.card.power < 4) {
    throw new Error(`Smash requires power >= 4`);
  }

  const updatedAttacker = {
    ...attackerCIP,
    abilityUsed: true,
    abilityRevealed: true,
  };
  const newTeam = replaceCIP(attackerTeam, updatedAttacker);

  const gs = {
    ...gameState,
    challenge: {
      ...challenge,
      smashApplied: { ...challenge.smashApplied, attacker: true },
    },
    players: {
      ...players,
      [challenge.attackerPlayerId]: {
        ...players[challenge.attackerPlayerId],
        team: newTeam,
      },
    },
  };

  return resolveAndContinue(gs);
}

function declineAttackerAbility(gameState) {
  if (gameState.phase !== 'challenge') {
    throw new Error(`declineAttackerAbility requires phase='challenge'`);
  }
  if (gameState.challenge.step !== 'attackerWindow') {
    throw new Error(
      `declineAttackerAbility requires step='attackerWindow', got: ${gameState.challenge.step}`
    );
  }

  return resolveAndContinue(gameState);
}

// ---------------------------------------------------------------------------
// resolveAndContinue — internal
// ---------------------------------------------------------------------------

function resolveAndContinue(gameState) {
  const { challenge, players } = gameState;
  const {
    attackerPlayerId,
    defenderPlayerId,
    attackerCardId,
    defenderCardId,
    attackerStat,
    guardedStat,
    smashApplied,
    trickedToStat,
  } = challenge;

  const contestedStat = trickedToStat !== null ? trickedToStat : attackerStat;

  const attackerTeam = players[attackerPlayerId].team;
  const defenderTeam = players[defenderPlayerId].team;
  const attackerCIP = findCIP(attackerTeam, attackerCardId);
  const defenderCIP = findCIP(defenderTeam, defenderCardId);

  const attackerEff =
    attackerCIP.card[contestedStat] +
    (attackerCIP.bondPartnerId ? BOND_BONUS : 0) +
    (attackerCIP.rallyBonus || 0) +
    (smashApplied.attacker ? SMASH_BONUS : 0);

  const defenderEff =
    defenderCIP.card[contestedStat] +
    (defenderCIP.bondPartnerId ? BOND_BONUS : 0) +
    (defenderCIP.rallyBonus || 0) +
    (guardedStat === contestedStat ? GUARD_BONUS : 0) +
    (smashApplied.defender ? SMASH_BONUS : 0);

  // Stand-off
  if (attackerEff === defenderEff) {
    return cleanupChallenge({
      ...gameState,
      challenge: {
        ...challenge,
        step: 'done',
        knockedOutCardId: null,
        knockedOutPlayerId: null,
      },
    });
  }

  let knockedOutCardId;
  let knockedOutPlayerId;
  let knockedOutCIP;

  if (attackerEff > defenderEff) {
    knockedOutCardId = defenderCardId;
    knockedOutPlayerId = defenderPlayerId;
    knockedOutCIP = defenderCIP;
  } else {
    knockedOutCardId = attackerCardId;
    knockedOutPlayerId = attackerPlayerId;
    knockedOutCIP = attackerCIP;
  }

  // Check for Dodge
  if (
    knockedOutCIP.card.ability === 'Dodge' &&
    !knockedOutCIP.abilityUsed &&
    knockedOutCIP.card.speed >= 4
  ) {
    return {
      ...gameState,
      challenge: {
        ...challenge,
        step: 'dodgeWindow',
        knockedOutCardId,
        knockedOutPlayerId,
      },
    };
  }

  // Apply KO
  const koPlayerId = knockedOutPlayerId;
  const koTeam = players[koPlayerId].team;
  const koCIP = findCIP(koTeam, knockedOutCardId);
  const newKoTeam = replaceCIP(koTeam, { ...koCIP, knockedOut: true });

  const gs = {
    ...gameState,
    challenge: {
      ...challenge,
      step: 'done',
      knockedOutCardId,
      knockedOutPlayerId,
    },
    players: {
      ...players,
      [koPlayerId]: { ...players[koPlayerId], team: newKoTeam },
    },
  };

  return cleanupChallenge(gs);
}

// ---------------------------------------------------------------------------
// fireDodge / declineDodge
// ---------------------------------------------------------------------------

function fireDodge(gameState) {
  if (gameState.phase !== 'challenge') {
    throw new Error(`fireDodge requires phase='challenge'`);
  }
  if (gameState.challenge.step !== 'dodgeWindow') {
    throw new Error(
      `fireDodge requires step='dodgeWindow', got: ${gameState.challenge.step}`
    );
  }

  const { challenge, players } = gameState;
  const { knockedOutCardId, knockedOutPlayerId } = challenge;

  const koTeam = players[knockedOutPlayerId].team;
  const koCIP = findCIP(koTeam, knockedOutCardId);

  if (!koCIP || koCIP.card.ability !== 'Dodge') {
    throw new Error(`KO'd card does not have Dodge ability`);
  }
  if (koCIP.abilityUsed) {
    throw new Error(`Dodge ability already used`);
  }
  if (koCIP.card.speed < 4) {
    throw new Error(`Dodge requires speed >= 4`);
  }

  const updatedCIP = { ...koCIP, abilityUsed: true, abilityRevealed: true };
  const newTeam = replaceCIP(koTeam, updatedCIP);

  const gs = {
    ...gameState,
    challenge: { ...challenge, step: 'done', knockedOutCardId: null, knockedOutPlayerId: null },
    players: {
      ...players,
      [knockedOutPlayerId]: { ...players[knockedOutPlayerId], team: newTeam },
    },
  };

  return cleanupChallenge(gs);
}

function declineDodge(gameState) {
  if (gameState.phase !== 'challenge') {
    throw new Error(`declineDodge requires phase='challenge'`);
  }
  if (gameState.challenge.step !== 'dodgeWindow') {
    throw new Error(
      `declineDodge requires step='dodgeWindow', got: ${gameState.challenge.step}`
    );
  }

  const { challenge, players } = gameState;
  const { knockedOutCardId, knockedOutPlayerId } = challenge;

  const koTeam = players[knockedOutPlayerId].team;
  const koCIP = findCIP(koTeam, knockedOutCardId);
  const newTeam = replaceCIP(koTeam, { ...koCIP, knockedOut: true });

  const gs = {
    ...gameState,
    challenge: { ...challenge, step: 'done' },
    players: {
      ...players,
      [knockedOutPlayerId]: { ...players[knockedOutPlayerId], team: newTeam },
    },
  };

  return cleanupChallenge(gs);
}

// ---------------------------------------------------------------------------
// cleanupChallenge — internal
// ---------------------------------------------------------------------------

function cleanupChallenge(gameState) {
  // Recompute bonds on BOTH teams
  const { playerIds, players } = gameState;
  const [p1Id, p2Id] = playerIds;

  const newTeam1 = recomputeBonds(players[p1Id].team);
  const newTeam2 = recomputeBonds(players[p2Id].team);

  let gs = {
    ...gameState,
    consecutivePasses: 0,
    challenge: null,
    phase: 'turn',
    players: {
      [p1Id]: { ...players[p1Id], team: newTeam1 },
      [p2Id]: { ...players[p2Id], team: newTeam2 },
    },
  };

  const winResult = checkWinConditions(gs);
  if (winResult) {
    return {
      ...gs,
      phase: 'gameOver',
      winnerId: winResult.winnerId,
      winReason: winResult.winReason,
    };
  }

  return advanceTurn(gs);
}

// ---------------------------------------------------------------------------
// passTurn
// ---------------------------------------------------------------------------

/**
 * @param {GameState} gameState
 * @returns {GameState}
 */
function passTurn(gameState) {
  if (gameState.phase !== 'turn') {
    throw new Error(`passTurn requires phase='turn', got: ${gameState.phase}`);
  }

  const { activePlayerId, playerIds, players } = gameState;
  const [p1Id, p2Id] = playerIds;
  const opponentId = activePlayerId === p1Id ? p2Id : p1Id;

  // Validate: hand empty AND cannot challenge
  const activePlayer = players[activePlayerId];
  const activeStanding = activePlayer.team.filter((cip) => !cip.knockedOut);
  const opponentStanding = players[opponentId].team.filter((cip) => !cip.knockedOut);
  const canChallenge = activeStanding.length > 0 && opponentStanding.length > 0;

  if (activePlayer.hand.length > 0 || canChallenge) {
    throw new Error(
      `passTurn requires hand to be empty and no possible challenges (hand: ${activePlayer.hand.length}, canChallenge: ${canChallenge})`
    );
  }

  const consecutivePasses = gameState.consecutivePasses + 1;

  if (consecutivePasses >= 2) {
    // Deck-out: compare team totals
    const total1 = getTeamTotal(players[p1Id].team);
    const total2 = getTeamTotal(players[p2Id].team);
    let winnerId = null;
    if (total1 > total2) winnerId = p1Id;
    else if (total2 > total1) winnerId = p2Id;
    // else tie: winnerId remains null

    return {
      ...gameState,
      consecutivePasses,
      phase: 'gameOver',
      winnerId,
      winReason: 'deckOut',
    };
  }

  return advanceTurn({ ...gameState, consecutivePasses });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  setupGame,
  submitOpeningPick,
  fireRally,
  declineRally,
  recruit,
  initiateChallenge,
  submitAttackStat,
  submitGuardStat,
  fireDefenderTrick,
  fireDefenderSmash,
  declineDefenderAbility,
  fireAttackerSmash,
  declineAttackerAbility,
  fireDodge,
  declineDodge,
  passTurn,
  // internal helpers exported for testing
  _checkWinConditions: checkWinConditions,
  _advanceTurn: advanceTurn,
  _makeCardInPlay: makeCardInPlay,
};
