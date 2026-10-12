'use strict';

/**
 * One link per test game.
 *
 *   POST /admin/test-games   — admin: make a new test game, returns its link
 *   GET  /admin/test-games   — admin: recent test games and how far along they are
 *   GET  /t/:code            — player: name form (or straight into the game if seated)
 *   POST /t/:code            — player: take the next free seat
 *
 * Both players get the same link. The first to submit their name takes seat 1
 * (a waiting game is created for them); the second takes seat 2 and the match
 * starts. Each player is a fresh tester account dealt 12 starter cards.
 * A device that already holds a seat is sent straight back into the game.
 */

const crypto = require('crypto');
const { getDb } = require('./_db');
const { genRoomCode } = require('./_utils');
const { generateToken, hashToken, verifyCookie, setSessionCookie, COOKIE_NAME } = require('../auth/player');
const { giveSampleDeck } = require('./fill-test');
const { resolveDeck } = require('./join');
const { createMatch } = require('../engine2/match');
const { RULE_SET } = require('../engine2/constants');
const { logEvent } = require('./_events');

const COLL = 'testgamesv1';

// ── Admin auth (same cookie as admin-page.js) ─────────────────────────────────
function isAdminAuthed(req) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const cookie = req.cookies?.alg_admin;
  if (!cookie) return false;
  const expected = crypto.createHmac('sha256', secret).update('admin-session').digest('base64url');
  const a = Buffer.from(cookie);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

function baseUrl(req) {
  return process.env.PUBLIC_BASE_URL || `https://${req.hostname}`;
}

// ── POST /admin/test-games ────────────────────────────────────────────────────
async function createTestGame(req, res) {
  if (!isAdminAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const db = await getDb();
    let code = null;
    for (let i = 0; i < 30; i++) {
      const c = genRoomCode();
      const [tg, g] = await Promise.all([
        db.collection(COLL).findOne({ code: c }),
        db.collection('gamesv2').findOne({ code: c, status: { $ne: 'complete' } }),
      ]);
      if (!tg && !g) { code = c; break; }
    }
    if (!code) return res.status(500).json({ error: 'Could not make a game code' });

    await db.collection(COLL).insertOne({ code, seats: [], createdAt: new Date() });
    return res.json({ code, url: `${baseUrl(req)}/t/${code}` });
  } catch (err) {
    console.error('createTestGame error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── GET /admin/test-games ─────────────────────────────────────────────────────
async function listTestGames(req, res) {
  if (!isAdminAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const db = await getDb();
    const tgs = await db.collection(COLL).find({}).sort({ createdAt: -1 }).limit(15).toArray();
    const games = await db.collection('gamesv2')
      .find({ code: { $in: tgs.map(t => t.code) } })
      .sort({ createdAt: -1 })
      .toArray();
    const gameByCode = {};
    for (const g of games) if (!gameByCode[g.code]) gameByCode[g.code] = g; // newest per code

    const out = tgs.map(t => {
      const g = gameByCode[t.code];
      let status = 'empty';
      if (t.seats.length === 1) status = 'waiting';
      if (g?.status === 'playing') status = 'playing';
      if (g?.status === 'complete') status = 'finished';
      return {
        code:      t.code,
        url:       `${baseUrl(req)}/t/${t.code}`,
        status,
        p1Name:    g?.p1?.name || null,
        p2Name:    g?.p2?.name || null,
        createdAt: t.createdAt,
      };
    });
    return res.json(out);
  } catch (err) {
    console.error('listTestGames error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── Player pages ──────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function page({ heading, message = '', form = '', error = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Allagaroo</title>
<link rel="icon" href="/mint/favicon.ico" sizes="any">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bagel+Fat+One&family=Instrument+Sans:wght@400;700&display=swap">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:#1B1026;color:#F6F0FA;font-family:'Instrument Sans',system-ui,sans-serif;min-height:100vh;
       display:flex;align-items:center;justify-content:center;padding:24px 16px}
  .card{background:#2A1C38;border:2px solid #3E2D52;border-radius:24px;padding:32px 24px;width:100%;max-width:380px;text-align:center}
  .logo{width:220px;max-width:80%;margin:0 auto 20px;display:block}
  h1{font-family:'Bagel Fat One',system-ui;font-weight:400;font-size:30px;line-height:1.1;margin-bottom:10px}
  .msg{color:#B9A9C9;font-size:15px;line-height:1.5;margin-bottom:24px}
  label{display:block;text-align:left;font-weight:700;font-size:14px;margin-bottom:6px}
  input{width:100%;padding:14px;border-radius:12px;border:2px solid #3E2D52;background:#1B1026;color:#F6F0FA;
        font:18px 'Instrument Sans',sans-serif;margin-bottom:16px}
  input:focus{outline:none;border-color:#FF2E93}
  button{width:100%;border:0;border-radius:14px;padding:16px;font:700 18px 'Instrument Sans',sans-serif;cursor:pointer;
         color:#1B1026;background:#FF2E93;box-shadow:0 4px 0 #b01f66}
  button:disabled{opacity:.6}
  .err{background:rgba(255,90,31,.15);border:1px solid #FF5A1F;color:#FFB08F;border-radius:10px;padding:10px;font-size:14px;margin-bottom:16px}
  .note{color:#B9A9C9;font-size:13px;margin-top:14px}
</style>
</head>
<body>
  <div class="card">
    <img class="logo" src="/mint/logo/svg/allagaroo-logo.svg" alt="Allagaroo">
    <h1>${heading}</h1>
    ${message ? `<p class="msg">${message}</p>` : ''}
    ${error ? `<div class="err">${esc(error)}</div>` : ''}
    ${form}
  </div>
</body>
</html>`;
}

function nameForm(code, error = '', name = '') {
  return page({
    heading: 'You\'re invited to play!',
    message: 'You\'ll be dealt 12 cards. Play head to head, first to win two rounds.',
    error,
    form: `<form method="POST" action="/t/${esc(code)}" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='Dealing your cards…'">
      <label for="nm">Your name</label>
      <input id="nm" name="name" maxlength="24" autocomplete="given-name" required autofocus value="${esc(name)}">
      <button type="submit">Let's play</button>
    </form>`,
  });
}

const notFound = () => page({
  heading: 'This link doesn\'t work',
  message: 'Check you copied the whole link, or ask Jonathan for a new one.',
});
const full = () => page({
  heading: 'This game is full',
  message: 'Two players have already joined. Ask Jonathan for a link to a new game.',
});

// The player already seated on this device, if any.
function seatedPlayerId(req, tg) {
  const session = verifyCookie(req.cookies?.[COOKIE_NAME]);
  return session && tg.seats.includes(session.playerId) ? session.playerId : null;
}

// ── GET /t/:code ──────────────────────────────────────────────────────────────
async function testGamePage(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const code = String(req.params.code || '').toUpperCase();
  try {
    const db = await getDb();
    const tg = await db.collection(COLL).findOne({ code });
    if (!tg) return res.status(404).send(notFound());
    if (seatedPlayerId(req, tg)) return res.redirect(302, `/g/${code}`);
    if (tg.seats.length >= 2) return res.send(full());
    return res.send(nameForm(code));
  } catch (err) {
    console.error('testGamePage error:', err);
    return res.status(500).send(page({ heading: 'Something went wrong', message: 'Please try again in a minute.' }));
  }
}

// ── POST /t/:code ─────────────────────────────────────────────────────────────
async function claimSeat(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const code = String(req.params.code || '').toUpperCase();
  const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ').slice(0, 24);

  try {
    const db = await getDb();
    const tgCol = db.collection(COLL);
    let tg = await tgCol.findOne({ code });
    if (!tg) return res.status(404).send(notFound());
    if (seatedPlayerId(req, tg)) return res.redirect(302, `/g/${code}`);
    if (!name) return res.send(nameForm(code, 'Type your name to play.'));

    // Reserve a seat atomically: only succeeds while fewer than two are taken.
    const playerId = crypto.randomUUID();
    const r = await tgCol.updateOne(
      { code, 'seats.1': { $exists: false } },
      { $push: { seats: playerId } }
    );
    if (r.modifiedCount === 0) return res.send(full());
    tg = await tgCol.findOne({ code });
    const seat = tg.seats.indexOf(playerId); // 0 or 1

    // A fresh tester account with 12 starter cards.
    const token = generateToken();
    const player = {
      id: playerId, name, token, tokenHash: hashToken(token),
      createdAt: new Date(), revokedAt: null, sessionVersion: 1,
      checkBlockedUntil: null, declineCount: 0, source: 'test-link', testGame: code,
    };
    await db.collection('players').insertOne(player);
    logEvent(playerId, 'session_created', { via: 'test-link' });
    await giveSampleDeck(playerId, db);

    const games = db.collection('gamesv2');

    if (seat === 0) {
      await games.insertOne({
        code, status: 'waiting',
        p1: { id: playerId, name }, p2: null,
        matchState: null, testGame: true,
        createdAt: new Date(), updatedAt: new Date(),
      });
      logEvent(playerId, 'match_created', { matchCode: code, via: 'test-link' });
    } else {
      // Seat 1's waiting game is created in their own request; give it a moment.
      let game = null;
      for (let i = 0; i < 10 && !game; i++) {
        game = await games.findOne({ code, status: 'waiting' });
        if (!game) await new Promise(r => setTimeout(r, 500));
      }
      if (!game) throw new Error(`test game ${code}: no waiting game for seat 2`);

      const [deckA, deckB] = await Promise.all([
        resolveDeck(game.p1.deckName, game.p1.deckId, game.p1.id, db),
        resolveDeck(null, null, playerId, db),
      ]);
      const matchState = createMatch(code, game.p1.id, deckA, playerId, deckB, RULE_SET.FAMILY_WHEEL);
      await games.updateOne(
        { _id: game._id, status: 'waiting' },
        { $set: { p2: { id: playerId, name }, matchState, status: 'playing', updatedAt: new Date() } }
      );
      logEvent(playerId, 'match_joined', { matchCode: code, via: 'test-link' });
    }

    setSessionCookie(res, playerId, player.sessionVersion);
    return res.redirect(302, `/g/${code}`);
  } catch (err) {
    console.error('claimSeat error:', err);
    return res.status(500).send(page({ heading: 'Something went wrong', message: 'Please try the link again in a minute.' }));
  }
}

module.exports = { createTestGame, listTestGames, testGamePage, claimSeat };
