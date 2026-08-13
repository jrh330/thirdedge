'use strict';

const { getDb } = require('./_db');

/**
 * Build a view of a team for poll response.
 * showAbility=true means always show ability name; false means only show if abilityRevealed.
 */
function buildTeamView(team, showAbility) {
  if (!team) return [];
  return team.map((cip) => ({
    card: {
      id: cip.card.id,
      name: cip.card.name,
      power: cip.card.power,
      speed: cip.card.speed,
      wits: cip.card.wits,
      trait: cip.card.trait,
      ability: (showAbility || cip.abilityRevealed) ? cip.card.ability : null,
    },
    abilityUsed: cip.abilityUsed,
    abilityRevealed: cip.abilityRevealed,
    bondPartnerId: cip.bondPartnerId,
    rallyBonus: cip.rallyBonus,
    knockedOut: cip.knockedOut,
    recruitOrder: cip.recruitOrder,
  }));
}

/**
 * Build a filtered view of the challenge state for a given player.
 * During 'picking', each player only sees their own pick.
 */
function buildChallengeView(challenge, playerId) {
  if (!challenge) return null;

  const {
    step,
    attackerCardId,
    defenderCardId,
    attackerPlayerId,
    defenderPlayerId,
    attackerStat,
    guardedStat,
    smashApplied,
    trickedToStat,
    knockedOutCardId,
    knockedOutPlayerId,
  } = challenge;

  // During 'picking': each player can only see their own stat selection
  const showAttackerStat = step !== 'picking' || playerId === attackerPlayerId;
  const showGuardedStat = step !== 'picking' || playerId === defenderPlayerId;

  return {
    step,
    attackerCardId,
    defenderCardId,
    attackerPlayerId,
    defenderPlayerId,
    attackerStat: showAttackerStat ? attackerStat : null,
    guardedStat: showGuardedStat ? guardedStat : null,
    smashApplied,
    trickedToStat,
    knockedOutCardId,
    knockedOutPlayerId,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { code, playerId } = req.query;
    if (!code || !playerId) {
      return res.status(400).json({ error: 'code and playerId required' });
    }

    const db = await getDb();
    const game = await db.collection('games').findOne({ code: code.toUpperCase() });
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const isP1 = game.p1?.id === playerId;
    const isP2 = game.p2?.id === playerId;
    if (!isP1 && !isP2) {
      return res.status(403).json({ error: 'Not a player in this game' });
    }

    const playerNum = isP1 ? 1 : 2;

    // Waiting state: game not started yet
    if (game.status === 'waiting' || !game.matchState) {
      return res.status(200).json({
        status: game.status,
        playerNum,
        myPlayerId: playerId,
        code: game.code,
        opponentJoined: !!game.p2,
      });
    }

    const matchState = game.matchState;
    const [p1Id, p2Id] = matchState.playerIds;
    const opponentId = playerId === p1Id ? p2Id : p1Id;

    // Current game info
    const cg = matchState.currentGame;

    const phase = cg ? cg.phase : null;
    const activePlayerId = cg ? cg.activePlayerId : null;
    const isMyTurn = cg ? cg.activePlayerId === playerId : false;

    // Teams
    const myTeamRaw = cg ? (cg.players[playerId]?.team || []) : [];
    const opTeamRaw = cg ? (cg.players[opponentId]?.team || []) : [];

    // Hand
    const myHandCards = cg ? (cg.players[playerId]?.hand || []) : [];
    const opponentHandCount = cg ? (cg.players[opponentId]?.hand?.length || 0) : 0;

    // Deck counts
    const myDeckCount = cg ? (cg.players[playerId]?.deck?.length || 0) : 0;
    const opponentDeckCount = cg ? (cg.players[opponentId]?.deck?.length || 0) : 0;

    // Opening picks
    const openingPicks = cg
      ? {
          myPick: cg.openingPicks[playerId] !== null && cg.openingPicks[playerId] !== undefined,
          opponentPicked:
            cg.openingPicks[opponentId] !== null && cg.openingPicks[opponentId] !== undefined,
        }
      : null;

    // Rally pending — only show to the player whose rally it is
    const rallyPending =
      cg && cg.rallyPending && cg.rallyPending.playerId === playerId
        ? cg.rallyPending
        : null;

    const response = {
      status: game.status,
      playerNum,
      myPlayerId: playerId,
      code: game.code,
      opponentJoined: !!game.p2,

      wins: matchState.wins,
      gameIndex: cg ? cg.gameIndex : null,
      phase,
      activePlayerId,
      isMyTurn,

      myTeam: buildTeamView(myTeamRaw, true),
      opponentTeam: buildTeamView(opTeamRaw, false),

      myHand: myHandCards,
      opponentHandCount,

      myDeckCount,
      opponentDeckCount,

      challenge: cg ? buildChallengeView(cg.challenge, playerId) : null,

      rallyPending,

      openingPicks,

      swaps: matchState.swaps,
      completedGamesCount: matchState.completedGames.length,
      winnerId: matchState.winnerId,

      myDeck: matchState.decks[playerId],

      // Expose opponent deck in postGame so winner can make informed swap choices
      oppDeck: game.status === 'postGame' ? (matchState.decks[opponentId] || []) : undefined,

      // Pass phase info for client convenience
      firstPlayerId: cg ? cg.firstPlayerId : null,
      winReason: cg ? cg.winReason : null,
      gameWinnerId: cg ? cg.winnerId : null,

      // Last completed game info (for post-game display)
      lastCompletedGame:
        matchState.completedGames.length > 0
          ? (() => {
              const lg = matchState.completedGames[matchState.completedGames.length - 1];
              return {
                gameIndex: lg.gameIndex,
                winnerId: lg.winnerId,
                winReason: lg.winReason,
              };
            })()
          : null,
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error('poll error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
