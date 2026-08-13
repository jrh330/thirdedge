'use strict';

const { getDb } = require('./_db');
const { genRoomCode } = require('./_utils');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const db = await getDb();
    const games = db.collection('games');

    // Generate unique room code
    let code;
    let attempts = 0;
    do {
      code = genRoomCode();
      const exists = await games.findOne({ code, status: { $ne: 'complete' } });
      if (!exists) break;
      attempts++;
    } while (attempts < 20);

    if (attempts >= 20) {
      return res.status(500).json({ error: 'Could not generate room code' });
    }

    const p1Id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const doc = {
      code,
      status: 'waiting',
      p1: { id: p1Id, name: 'Player 1' },
      p2: null,
      deckAssignment: {},
      matchState: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await games.insertOne(doc);

    return res.status(200).json({ code, playerId: p1Id, playerNum: 1 });
  } catch (err) {
    console.error('create error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
