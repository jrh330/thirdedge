'use strict';

const { getDb } = require('./_db');
const {
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
} = require('../engine/game');
const {
  recordGameResult,
  swapCard,
  reclaimSwap,
  declinePostGame,
  startGame,
  finalizeMatch,
} = require('../engine/match');
const { shuffle } = require('./_utils');

/**
 * After any game action, check if the game ended and auto-record the result.
 * Returns { matchState, docStatus } with the updated matchState and doc status string.
 */
function autoRecordIfGameOver(matchState) {
  const cg = matchState.currentGame;
  if (!cg || cg.phase !== 'gameOver') {
    return { matchState, docStatus: 'active' };
  }

  const updated = recordGameResult(matchState);
  // recordGameResult sets matchState.status to 'postGame' or 'complete'
  let docStatus = updated.status === 'complete' ? 'complete' : 'postGame';

  let finalMs = updated;
  if (updated.status === 'complete') {
    finalMs = finalizeMatch(updated);
  }

  return { matchState: finalMs, docStatus };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { code, playerId, action, data = {} } = req.body;
    if (!code || !playerId || !action) {
      return res.status(400).json({ error: 'Missing fields: code, playerId, action' });
    }

    const db = await getDb();
    const games = db.collection('games');
    const game = await games.findOne({ code: code.toUpperCase() });
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const isP1 = game.p1?.id === playerId;
    const isP2 = game.p2?.id === playerId;
    if (!isP1 && !isP2) {
      return res.status(403).json({ error: 'Not a player in this game' });
    }

    let matchState = game.matchState;
    if (!matchState) {
      return res.status(400).json({ error: 'Match not started yet' });
    }

    let newGame = matchState.currentGame;
    let newMatchState = matchState;
    let docStatus = game.status;

    try {
      // Game-level actions (operate on matchState.currentGame)
      if (action === 'submitOpeningPick') {
        newGame = submitOpeningPick(newGame, playerId, data.cardId);
        newMatchState = { ...matchState, currentGame: newGame };
        ({ matchState: newMatchState, docStatus } = autoRecordIfGameOver(newMatchState));

      } else if (action === 'recruit') {
        newGame = recruit(newGame, data.cardId);
        newMatchState = { ...matchState, currentGame: newGame };
        ({ matchState: newMatchState, docStatus } = autoRecordIfGameOver(newMatchState));

      } else if (action === 'initiateChallenge') {
        newGame = initiateChallenge(newGame, data.attackerCardId, data.defenderCardId);
        newMatchState = { ...matchState, currentGame: newGame };

      } else if (action === 'submitAttackStat') {
        newGame = submitAttackStat(newGame, data.stat);
        newMatchState = { ...matchState, currentGame: newGame };

      } else if (action === 'submitGuardStat') {
        newGame = submitGuardStat(newGame, data.stat);
        newMatchState = { ...matchState, currentGame: newGame };

      } else if (action === 'fireDefenderTrick') {
        newGame = fireDefenderTrick(newGame, data.newStat);
        newMatchState = { ...matchState, currentGame: newGame };

      } else if (action === 'fireDefenderSmash') {
        newGame = fireDefenderSmash(newGame);
        newMatchState = { ...matchState, currentGame: newGame };

      } else if (action === 'declineDefenderAbility') {
        newGame = declineDefenderAbility(newGame);
        newMatchState = { ...matchState, currentGame: newGame };

      } else if (action === 'fireAttackerSmash') {
        newGame = fireAttackerSmash(newGame);
        newMatchState = { ...matchState, currentGame: newGame };
        ({ matchState: newMatchState, docStatus } = autoRecordIfGameOver(newMatchState));

      } else if (action === 'declineAttackerAbility') {
        newGame = declineAttackerAbility(newGame);
        newMatchState = { ...matchState, currentGame: newGame };
        ({ matchState: newMatchState, docStatus } = autoRecordIfGameOver(newMatchState));

      } else if (action === 'fireDodge') {
        newGame = fireDodge(newGame);
        newMatchState = { ...matchState, currentGame: newGame };
        ({ matchState: newMatchState, docStatus } = autoRecordIfGameOver(newMatchState));

      } else if (action === 'declineDodge') {
        newGame = declineDodge(newGame);
        newMatchState = { ...matchState, currentGame: newGame };
        ({ matchState: newMatchState, docStatus } = autoRecordIfGameOver(newMatchState));

      } else if (action === 'fireRally') {
        newGame = fireRally(newGame, data.targetCardId !== undefined ? data.targetCardId : null);
        newMatchState = { ...matchState, currentGame: newGame };
        ({ matchState: newMatchState, docStatus } = autoRecordIfGameOver(newMatchState));

      } else if (action === 'declineRally') {
        newGame = declineRally(newGame);
        newMatchState = { ...matchState, currentGame: newGame };
        ({ matchState: newMatchState, docStatus } = autoRecordIfGameOver(newMatchState));

      } else if (action === 'passTurn') {
        newGame = passTurn(newGame);
        newMatchState = { ...matchState, currentGame: newGame };
        ({ matchState: newMatchState, docStatus } = autoRecordIfGameOver(newMatchState));

      // Match-level actions (operate on matchState directly)
      } else if (action === 'swap') {
        newMatchState = swapCard(matchState, data.winnerGaveCardId, data.winnerTookCardId);
        docStatus = 'postGame';

      } else if (action === 'reclaim') {
        newMatchState = reclaimSwap(matchState, data.swapIndex);
        docStatus = 'postGame';

      } else if (action === 'declinePostGame') {
        newMatchState = declinePostGame(matchState);
        docStatus = 'postGame';

      } else if (action === 'startNextGame') {
        // firstPlayerId = loser of last completed game
        const completedGames = matchState.completedGames;
        const lastGame = completedGames[completedGames.length - 1];
        const [p1Id, p2Id] = matchState.playerIds;
        let firstPlayerId;
        if (!lastGame || !lastGame.winnerId) {
          // Draw or no completed games: pick randomly
          firstPlayerId = Math.random() < 0.5 ? p1Id : p2Id;
        } else {
          // Loser of last game goes first
          firstPlayerId = lastGame.winnerId === p1Id ? p2Id : p1Id;
        }
        newMatchState = startGame(matchState, firstPlayerId);
        docStatus = 'active';

      } else {
        return res.status(400).json({ error: `Unknown action: ${action}` });
      }
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    await games.updateOne(
      { _id: game._id },
      { $set: { matchState: newMatchState, status: docStatus, updatedAt: new Date() } }
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('action error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
