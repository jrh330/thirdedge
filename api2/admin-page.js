'use strict';

/**
 * Admin dashboard page.
 *
 * GET  /admin          — login form or dashboard HTML
 * POST /admin/login    — validate password, set session cookie
 * GET  /admin/logout   — clear session cookie
 * GET  /admin/players  — JSON list of all players with card counts
 */

const crypto = require('crypto');
const { getDb } = require('./_db');
const { buildMe } = require('./me');

const ADMIN_COOKIE = 'alg_admin';

// ── Auth helpers ──────────────────────────────────────────────────────────────

function adminToken() {
  const secret = process.env.ADMIN_SECRET || '';
  return crypto.createHmac('sha256', secret).update('admin-session').digest('base64url');
}

function isAdminAuthed(req) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const cookie = req.cookies?.[ADMIN_COOKIE];
  if (!cookie) return false;
  const expected = adminToken();
  const a = Buffer.from(cookie);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

// ── Route handlers ────────────────────────────────────────────────────────────

function adminPage(req, res) {
  if (!isAdminAuthed(req)) {
    return res.send(loginHtml());
  }
  return res.send(dashboardHtml());
}

function adminLogin(req, res) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.redirect('/admin');

  const { password } = req.body || {};
  const a = Buffer.from(password || '');
  const b = Buffer.from(secret);
  const match = a.length === b.length && (() => {
    try { return crypto.timingSafeEqual(a, b); } catch { return false; }
  })();

  if (!match) {
    return res.send(loginHtml('Wrong password.'));
  }

  res.cookie(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
  });
  res.redirect('/admin');
}

function adminLogout(req, res) {
  res.clearCookie(ADMIN_COOKIE);
  res.redirect('/admin');
}

async function listPlayers(req, res) {
  if (!isAdminAuthed(req)) return res.status(401).json({ error: 'unauthorized' });

  try {
    const db = await getDb();
    const players = await db.collection('players')
      .find({})
      .sort({ createdAt: 1 })
      .toArray();

    const playerIds = players.map(p => p.id);

    // Own cards vs sample cards
    const cardCounts = await db.collection('cardsv2')
      .aggregate([
        { $match: { ownerId: { $in: playerIds }, deleted: { $ne: true } } },
        { $group: {
          _id:    '$ownerId',
          total:  { $sum: 1 },
          sample: { $sum: { $cond: [{ $eq: ['$source', 'sample'] }, 1, 0] } },
        }},
      ]).toArray();

    const countById = Object.fromEntries(cardCounts.map(c => [c._id, c]));

    // Find live matches for these players
    const liveGames = await db.collection('gamesv2').find({
      status: { $in: ['waiting', 'playing'] },
      $or: [
        { 'p1.id': { $in: playerIds } },
        { 'p2.id': { $in: playerIds } },
      ],
    }).toArray();

    const matchByPlayerId = {};
    for (const g of liveGames) {
      if (g.p1?.id) matchByPlayerId[g.p1.id] = { code: g.code, status: g.status };
      if (g.p2?.id) matchByPlayerId[g.p2.id] = { code: g.code, status: g.status };
    }

    const baseUrl = process.env.PUBLIC_BASE_URL || `https://${req.hostname}`;

    const result = players.map(p => {
      const counts = countById[p.id] || { total: 0, sample: 0 };
      return {
        id:          p.id,
        name:        p.name,
        joinUrl:     p.token ? `${baseUrl}/j/${p.token}` : null,
        token:       p.token || null,
        cardCount:   counts.total,
        ownCards:    counts.total - counts.sample,
        sampleCards: counts.sample,
        liveMatch:   matchByPlayerId[p.id] || null,
        revoked:     !!p.revokedAt,
        createdAt:   p.createdAt,
      };
    });

    res.json(result);
  } catch (err) {
    console.error('listPlayers error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ── GET /admin/players/:id/state ──────────────────────────────────────────────
// Returns the same /api2/me shape for any player, so the admin dashboard and
// the client can never disagree about a player's state.

async function getPlayerState(req, res) {
  if (!isAdminAuthed(req)) return res.status(401).json({ error: 'unauthorized' });

  const { id } = req.params;
  try {
    const db = await getDb();
    const player = await db.collection('players').findOne({ id });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const state = await buildMe(player);
    res.json(state);
  } catch (err) {
    console.error('getPlayerState error:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { adminPage, adminLogin, adminLogout, listPlayers, getPlayerState };

// ── HTML templates ────────────────────────────────────────────────────────────

function loginHtml(errorMsg = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Allagaroo Admin</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #110915;
    color: #F6F0FA;
    font-family: 'Instrument Sans', system-ui, sans-serif;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    background: #1E1228;
    border: 1px solid rgba(246,240,250,.1);
    border-radius: 16px;
    padding: 36px 32px;
    width: 100%;
    max-width: 380px;
  }
  h1 { font-size: 22px; font-weight: 800; margin-bottom: 6px; }
  .sub { color: #9B8AAE; font-size: 14px; margin-bottom: 28px; }
  label { display: block; font-size: 13px; color: #9B8AAE; margin-bottom: 6px; font-weight: 500; }
  input[type=password] {
    width: 100%;
    background: rgba(246,240,250,.06);
    border: 1px solid rgba(246,240,250,.14);
    border-radius: 10px;
    color: #F6F0FA;
    font-size: 15px;
    padding: 11px 14px;
    outline: none;
    font-family: inherit;
  }
  input[type=password]:focus { border-color: rgba(246,240,250,.35); }
  .error { color: #FF6B6B; font-size: 13px; margin-top: 10px; }
  button {
    margin-top: 18px;
    width: 100%;
    background: #C84B8F;
    border: none;
    border-radius: 10px;
    color: #fff;
    font-size: 15px;
    font-weight: 700;
    font-family: inherit;
    padding: 12px;
    cursor: pointer;
    letter-spacing: .3px;
  }
  button:hover { background: #D9569E; }
</style>
</head>
<body>
<div class="card">
  <h1>Allagaroo Admin</h1>
  <p class="sub">Sign in to manage testers</p>
  <form method="POST" action="/admin/login">
    <label for="pw">Password</label>
    <input type="password" id="pw" name="password" autofocus autocomplete="current-password">
    ${errorMsg ? `<p class="error">${errorMsg}</p>` : ''}
    <button type="submit">Sign in →</button>
  </form>
</div>
</body>
</html>`;
}

function dashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Allagaroo Admin</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #110915;
    color: #F6F0FA;
    font-family: 'Instrument Sans', system-ui, -apple-system, sans-serif;
    min-height: 100vh;
    padding-bottom: 60px;
  }
  a { color: inherit; text-decoration: none; }

  header {
    background: rgba(17,9,21,.92);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid rgba(246,240,250,.08);
    padding: 0 24px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky; top: 0; z-index: 10;
  }
  .logo { font-size: 18px; font-weight: 800; color: #C84B8F; }
  .logout-btn {
    background: none;
    border: 1px solid rgba(246,240,250,.14);
    border-radius: 8px;
    color: #9B8AAE;
    font-size: 13px;
    font-family: inherit;
    padding: 6px 14px;
    cursor: pointer;
  }
  .logout-btn:hover { border-color: rgba(246,240,250,.3); color: #F6F0FA; }

  .page { max-width: 960px; margin: 0 auto; padding: 32px 20px 0; }

  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 28px;
  }
  @media (max-width: 600px) { .stats { grid-template-columns: repeat(2, 1fr); } }
  .stat {
    background: #1E1228;
    border: 1px solid rgba(246,240,250,.08);
    border-radius: 12px;
    padding: 16px;
  }
  .stat-val { font-size: 28px; font-weight: 800; line-height: 1; }
  .stat-label { font-size: 12px; color: #9B8AAE; margin-top: 4px; font-weight: 500; }

  .panel {
    background: #1E1228;
    border: 1px solid rgba(246,240,250,.08);
    border-radius: 14px;
    padding: 20px;
    margin-bottom: 24px;
  }
  .panel-title {
    font-size: 14px;
    font-weight: 700;
    color: #F6F0FA;
    margin-bottom: 14px;
  }

  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

  input[type=text], select {
    flex: 1;
    min-width: 120px;
    background: rgba(246,240,250,.06);
    border: 1px solid rgba(246,240,250,.14);
    border-radius: 10px;
    color: #F6F0FA;
    font-size: 14px;
    padding: 10px 13px;
    outline: none;
    font-family: inherit;
  }
  input[type=text]:focus, select:focus { border-color: rgba(246,240,250,.35); }
  select option { background: #1E1228; }

  .btn-pink {
    background: #C84B8F;
    border: none;
    border-radius: 10px;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    font-family: inherit;
    padding: 10px 18px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .btn-pink:hover { background: #D9569E; }
  .btn-pink:disabled { opacity: .5; cursor: default; }

  .result-box {
    display: none;
    margin-top: 14px;
    background: rgba(200,75,143,.08);
    border: 1px solid rgba(200,75,143,.25);
    border-radius: 10px;
    padding: 14px 16px;
  }
  .result-box.show { display: block; }
  .result-label { font-size: 11px; color: #C84B8F; font-weight: 700; margin-bottom: 8px; letter-spacing: .5px; text-transform: uppercase; }
  .result-name  { font-size: 15px; font-weight: 700; margin-bottom: 10px; }

  .link-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
  .link-label { font-size: 11px; color: #9B8AAE; width: 20px; flex-shrink: 0; font-weight: 700; }
  .link-text {
    flex: 1;
    background: rgba(246,240,250,.06);
    border: 1px solid rgba(246,240,250,.1);
    border-radius: 8px;
    padding: 7px 11px;
    font-size: 11px;
    color: #B7AAC6;
    word-break: break-all;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }
  .btn-copy {
    background: rgba(246,240,250,.1);
    border: 1px solid rgba(246,240,250,.18);
    border-radius: 8px;
    color: #F6F0FA;
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    padding: 7px 13px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background .15s;
  }
  .btn-copy:hover { background: rgba(246,240,250,.18); }
  .btn-copy.copied { background: rgba(52,199,89,.2); border-color: rgba(52,199,89,.4); color: #34C759; }

  /* ── Table ── */
  .table-wrap {
    background: #1E1228;
    border: 1px solid rgba(246,240,250,.08);
    border-radius: 14px;
    overflow: hidden;
    margin-bottom: 24px;
  }
  .table-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid rgba(246,240,250,.08);
  }
  table { width: 100%; border-collapse: collapse; }
  th {
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    color: #9B8AAE;
    letter-spacing: .6px;
    text-transform: uppercase;
    padding: 11px 16px;
    border-bottom: 1px solid rgba(246,240,250,.08);
    white-space: nowrap;
  }
  td {
    padding: 12px 16px;
    font-size: 13px;
    border-bottom: 1px solid rgba(246,240,250,.04);
    vertical-align: middle;
  }
  tr:last-child td { border-bottom: none; }
  tr.revoked td { opacity: .4; }

  .badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .4px;
    padding: 2px 8px;
    border-radius: 20px;
    text-transform: uppercase;
  }
  .badge-active  { background: rgba(52,199,89,.15);  color: #34C759; border: 1px solid rgba(52,199,89,.3); }
  .badge-revoked { background: rgba(255,107,107,.1);  color: #FF6B6B; border: 1px solid rgba(255,107,107,.2); }
  .badge-match   { background: rgba(200,75,143,.15);  color: #E06AA8; border: 1px solid rgba(200,75,143,.3); font-family: monospace; }
  .badge-waiting { background: rgba(255,200,0,.1);    color: #FFC800; border: 1px solid rgba(255,200,0,.25); }

  .acts { display: flex; gap: 5px; flex-wrap: wrap; }
  .ab {
    background: none;
    border: 1px solid rgba(246,240,250,.12);
    border-radius: 6px;
    color: #9B8AAE;
    font-size: 11px;
    font-weight: 600;
    font-family: inherit;
    padding: 4px 10px;
    cursor: pointer;
    white-space: nowrap;
  }
  .ab:hover           { border-color: rgba(246,240,250,.28); color: #F6F0FA; }
  .ab.ab-revoke:hover { border-color: rgba(255,107,107,.5);  color: #FF6B6B; }
  .ab.ab-restore:hover{ border-color: rgba(52,199,89,.5);    color: #34C759; }
  .ab.ab-reset:hover  { border-color: rgba(255,107,107,.5);  color: #FF6B6B; }
  .ab.ab-give:hover   { border-color: rgba(200,75,143,.5);   color: #C84B8F; }

  .no-link { color: #9B8AAE; font-size: 12px; font-style: italic; }

  .cards-cell { white-space: nowrap; }
  .cards-own    { color: #F6F0FA; font-weight: 600; }
  .cards-sample { color: #9B8AAE; font-size: 11px; margin-left: 4px; }

  @media (max-width: 680px) {
    .col-link, .col-match { display: none; }
    td, th { padding: 10px 12px; }
  }

  .empty-state { text-align: center; padding: 40px 20px; color: #9B8AAE; font-size: 14px; }
  .loading-msg { text-align: center; padding: 40px 20px; color: #9B8AAE; font-size: 14px; }

  .age { font-size: 12px; color: #9B8AAE; }
</style>
</head>
<body>

<header>
  <span class="logo">Allagaroo Admin</span>
  <form method="POST" action="/admin/logout" style="display:inline">
    <button class="logout-btn" type="submit">Sign out</button>
  </form>
</header>

<div class="page">

  <!-- Stats -->
  <div class="stats">
    <div class="stat"><div class="stat-val" id="stat-total">—</div><div class="stat-label">Testers</div></div>
    <div class="stat"><div class="stat-val" id="stat-active" style="color:#34C759">—</div><div class="stat-label">Active</div></div>
    <div class="stat"><div class="stat-val" id="stat-matches" style="color:#C84B8F">—</div><div class="stat-label">Live matches</div></div>
    <div class="stat"><div class="stat-val" id="stat-cards" style="color:#9B8AAE">—</div><div class="stat-label">Own cards made</div></div>
  </div>

  <!-- Add tester -->
  <div class="panel">
    <div class="panel-title">Add tester</div>
    <div class="row">
      <input type="text" id="new-name" placeholder="Name" maxlength="40">
      <button class="btn-pink" id="create-btn" onclick="createTester()">Create invite</button>
    </div>
    <div class="result-box" id="new-invite">
      <div class="result-label">Invite created</div>
      <div class="result-name" id="new-invite-name"></div>
      <div class="link-row">
        <div class="link-text" id="new-invite-url"></div>
        <button class="btn-copy" id="new-invite-copy" onclick="copyNewInvite()">Copy</button>
      </div>
      <p style="font-size:12px;color:#9B8AAE;margin-top:6px">Send this link once — they tap it and they're in.</p>
    </div>
  </div>

  <!-- Pair two testers -->
  <div class="panel">
    <div class="panel-title">Pair two testers</div>
    <div class="row">
      <select id="pair-p1"><option value="">Player 1…</option></select>
      <select id="pair-p2"><option value="">Player 2…</option></select>
      <button class="btn-pink" id="pair-btn" onclick="pairTesters()">Pair →</button>
    </div>
    <div class="result-box" id="pair-result">
      <div class="result-label">Match created — <span id="pair-code" style="font-family:monospace;font-size:13px"></span></div>
      <div class="link-row" id="pair-p1-row">
        <div class="link-label">P1</div>
        <div class="link-text" id="pair-p1-url"></div>
        <button class="btn-copy" onclick="copyPairLink('pair-p1-url', this)">Copy</button>
      </div>
      <div class="link-row" id="pair-p2-row">
        <div class="link-label">P2</div>
        <div class="link-text" id="pair-p2-url"></div>
        <button class="btn-copy" onclick="copyPairLink('pair-p2-url', this)">Copy</button>
      </div>
      <p style="font-size:12px;color:#9B8AAE;margin-top:6px">Each link lands that person straight in the match.</p>
    </div>
  </div>

  <!-- Tester table -->
  <div class="table-wrap">
    <div class="table-header">
      <span style="font-size:14px;font-weight:700">Testers</span>
      <button class="ab" onclick="loadPlayers()" style="font-size:12px">Refresh</button>
    </div>
    <div id="table-body"><div class="loading-msg">Loading…</div></div>
  </div>

  <!-- Live matches -->
  <div class="table-wrap">
    <div class="table-header">
      <span style="font-size:14px;font-weight:700">Live matches</span>
      <button class="ab" onclick="loadMatches()" style="font-size:12px">Refresh</button>
    </div>
    <div id="matches-body"><div class="loading-msg">Loading…</div></div>
  </div>

</div>

<script>
let players  = [];
let adminSecret = null;

function getSecret() {
  if (adminSecret) return adminSecret;
  adminSecret = sessionStorage.getItem('alg_admin_secret');
  if (!adminSecret) {
    adminSecret = prompt('Enter admin password to perform actions:');
    if (adminSecret) sessionStorage.setItem('alg_admin_secret', adminSecret);
  }
  return adminSecret;
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadPlayers() {
  try {
    const r = await fetch('/admin/players');
    if (!r.ok) { document.getElementById('table-body').innerHTML = '<div class="empty-state">Failed to load.</div>'; return; }
    players = await r.json();
    renderPlayers();
    populatePairSelects();
  } catch(e) {
    document.getElementById('table-body').innerHTML = '<div class="empty-state">Error loading testers.</div>';
  }
}

async function loadMatches() {
  const secret = getSecret();
  if (!secret) return;
  document.getElementById('matches-body').innerHTML = '<div class="loading-msg">Loading…</div>';
  try {
    const r = await fetch('/admin/matches', { headers: { 'x-admin-secret': secret } });
    if (!r.ok) { document.getElementById('matches-body').innerHTML = '<div class="empty-state">Failed to load.</div>'; return; }
    const matches = await r.json();
    renderMatches(matches);
    document.getElementById('stat-matches').textContent = matches.length;
  } catch(e) {
    document.getElementById('matches-body').innerHTML = '<div class="empty-state">Error loading matches.</div>';
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderPlayers() {
  const total   = players.length;
  const active  = players.filter(p => !p.revoked).length;
  const ownCards = players.reduce((s, p) => s + (p.ownCards || 0), 0);

  document.getElementById('stat-total').textContent  = total;
  document.getElementById('stat-active').textContent = active;
  document.getElementById('stat-cards').textContent  = ownCards;

  if (!players.length) {
    document.getElementById('table-body').innerHTML = '<div class="empty-state">No testers yet. Add one above.</div>';
    return;
  }

  let html = \`<table>
    <thead><tr>
      <th>Name</th>
      <th>Cards</th>
      <th class="col-match">Match</th>
      <th class="col-link">Invite link</th>
      <th>Actions</th>
    </tr></thead>
    <tbody>\`;

  for (const p of players) {
    const statusBadge = p.revoked
      ? '<span class="badge badge-revoked">Revoked</span>'
      : '<span class="badge badge-active">Active</span>';

    const cardsCell = \`<span class="cards-cell"><span class="cards-own">\${p.ownCards}</span><span class="cards-sample"> +\${p.sampleCards}s</span></span>\`;

    const matchCell = p.liveMatch
      ? \`<span class="badge \${p.liveMatch.status === 'playing' ? 'badge-match' : 'badge-waiting'}">\${escHtml(p.liveMatch.code)}</span>\`
      : '<span class="no-link">—</span>';

    const linkCell = p.joinUrl
      ? \`<div style="display:flex;gap:6px;align-items:center">
           <div class="link-text" style="font-size:10px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${escHtml(p.joinUrl)}</div>
           <button class="btn-copy" style="padding:5px 10px;font-size:11px" onclick="copyLink('\${escHtml(p.joinUrl)}', this)">Copy</button>
         </div>\`
      : '<span class="no-link">No link</span>';

    const actions = buildActions(p);

    html += \`<tr class="\${p.revoked ? 'revoked' : ''}">
      <td style="font-weight:600">\${escHtml(p.name)}<br><span style="font-size:11px;color:#9B8AAE;font-weight:400">\${statusBadge}</span></td>
      <td>\${cardsCell}</td>
      <td class="col-match">\${matchCell}</td>
      <td class="col-link">\${linkCell}</td>
      <td><div class="acts">\${actions}</div></td>
    </tr>\`;
  }

  html += '</tbody></table>';
  document.getElementById('table-body').innerHTML = html;
}

function buildActions(p) {
  const id = escHtml(p.id);
  const name = escHtml(p.name);
  const token = escHtml(p.token || '');
  let btns = '';

  if (!p.revoked) {
    btns += \`<button class="ab ab-give" onclick="giveSamples('\${id}', '\${name}')">Give samples</button>\`;
    if (p.sampleCards > 0) {
      btns += \`<button class="ab" onclick="clearSamples('\${id}', '\${name}')">Clear samples</button>\`;
    }
  }

  if (p.revoked) {
    btns += \`<button class="ab ab-restore" onclick="restorePlayer('\${id}')">Restore</button>\`;
  } else if (token) {
    btns += \`<button class="ab ab-revoke" onclick="revokePlayer('\${token}')">Revoke</button>\`;
  }

  if (!p.revoked) {
    btns += \`<button class="ab ab-reset" onclick="resetPlayer('\${id}', '\${name}')">Reset</button>\`;
  }

  return btns || '<span class="no-link">—</span>';
}

function renderMatches(matches) {
  if (!matches.length) {
    document.getElementById('matches-body').innerHTML = '<div class="empty-state">No live matches.</div>';
    return;
  }

  let html = \`<table>
    <thead><tr>
      <th>Code</th>
      <th>Players</th>
      <th>Round / Phase</th>
      <th>Age</th>
      <th></th>
    </tr></thead>
    <tbody>\`;

  for (const m of matches) {
    const mins = Math.floor(m.ageMs / 60000);
    const age  = mins < 1 ? 'just now' : mins + 'm';
    const p1n  = escHtml(m.p1?.name || '?');
    const p2n  = escHtml(m.p2?.name || 'waiting…');
    html += \`<tr>
      <td style="font-family:monospace;font-weight:700">\${escHtml(m.code)}</td>
      <td>\${p1n} vs \${p2n}</td>
      <td>Round \${m.round}\${m.phase ? ' · ' + escHtml(m.phase) : ''}</td>
      <td class="age">\${age}</td>
      <td><button class="ab ab-revoke" onclick="forceEnd('\${escHtml(m.code)}')">End</button></td>
    </tr>\`;
  }

  html += '</tbody></table>';
  document.getElementById('matches-body').innerHTML = html;
}

function populatePairSelects() {
  const active = players.filter(p => !p.revoked);
  const opts   = active.map(p => \`<option value="\${escHtml(p.id)}">\${escHtml(p.name)}</option>\`).join('');
  document.getElementById('pair-p1').innerHTML = '<option value="">Player 1…</option>' + opts;
  document.getElementById('pair-p2').innerHTML = '<option value="">Player 2…</option>' + opts;
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function createTester() {
  const name = document.getElementById('new-name').value.trim();
  if (!name) { document.getElementById('new-name').focus(); return; }
  const secret = getSecret();
  if (!secret) return;

  const btn = document.getElementById('create-btn');
  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    const r = await fetch('/admin/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
      body: JSON.stringify({ name }),
    });
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Failed'); return; }

    document.getElementById('new-invite-name').textContent = data.name;
    document.getElementById('new-invite-url').textContent  = data.joinUrl;
    document.getElementById('new-invite').classList.add('show');
    document.getElementById('new-name').value = '';
    await loadPlayers();
  } catch(e) { alert('Error: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Create invite'; }
}

async function pairTesters() {
  const p1Id = document.getElementById('pair-p1').value;
  const p2Id = document.getElementById('pair-p2').value;
  if (!p1Id || !p2Id) { alert('Select both players'); return; }
  if (p1Id === p2Id)  { alert('Select two different players'); return; }
  const secret = getSecret();
  if (!secret) return;

  const btn = document.getElementById('pair-btn');
  btn.disabled = true; btn.textContent = 'Pairing…';
  try {
    const r = await fetch('/admin/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
      body: JSON.stringify({ p1Id, p2Id }),
    });
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Failed'); return; }

    document.getElementById('pair-code').textContent   = data.code;
    document.getElementById('pair-p1-url').textContent = data.p1Link;
    document.getElementById('pair-p2-url').textContent = data.p2Link;
    document.getElementById('pair-p1-row').querySelector('.link-label').textContent = data.p1Name;
    document.getElementById('pair-p2-row').querySelector('.link-label').textContent = data.p2Name;
    document.getElementById('pair-result').classList.add('show');
    await loadMatches();
  } catch(e) { alert('Error: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Pair →'; }
}

async function giveSamples(id, name) {
  const secret = getSecret();
  if (!secret) return;
  const r = await fetch('/admin/players/' + id + '/give-samples', {
    method: 'POST',
    headers: { 'x-admin-secret': secret },
  });
  const d = await r.json();
  if (!r.ok) { alert(d.error || 'Failed'); return; }
  alert(d.added > 0 ? \`Gave \${d.added} sample cards to \${name}\` : \`\${name} already has a full deck\`);
  await loadPlayers();
}

async function clearSamples(id, name) {
  if (!confirm(\`Remove all sample cards from \${name}?\`)) return;
  const secret = getSecret();
  if (!secret) return;
  const r = await fetch('/admin/players/' + id + '/clear-samples', {
    method: 'POST',
    headers: { 'x-admin-secret': secret },
  });
  const d = await r.json();
  if (!r.ok) { alert(d.error || 'Failed'); return; }
  alert(\`Removed \${d.removed} sample cards from \${name}\`);
  await loadPlayers();
}

async function revokePlayer(token) {
  if (!token) return;
  if (!confirm('Revoke this tester? They will be logged out.')) return;
  const secret = getSecret();
  if (!secret) return;
  const r = await fetch('/admin/invites/' + token, {
    method: 'DELETE',
    headers: { 'x-admin-secret': secret },
  });
  if (!r.ok) { const d = await r.json(); alert(d.error || 'Failed'); return; }
  await loadPlayers();
}

async function restorePlayer(id) {
  const secret = getSecret();
  if (!secret) return;
  const r = await fetch('/admin/players/' + id + '/restore', {
    method: 'POST',
    headers: { 'x-admin-secret': secret },
  });
  if (!r.ok) { const d = await r.json(); alert(d.error || 'Failed'); return; }
  await loadPlayers();
}

async function resetPlayer(id, name) {
  if (!confirm(\`Reset \${name}? This wipes all their cards and logs them out of all devices.\`)) return;
  const secret = getSecret();
  if (!secret) return;
  const r = await fetch('/admin/players/' + id + '/reset', {
    method: 'POST',
    headers: { 'x-admin-secret': secret },
  });
  if (!r.ok) { const d = await r.json(); alert(d.error || 'Failed'); return; }
  alert(\`\${name} has been reset.\`);
  await loadPlayers();
}

async function forceEnd(code) {
  if (!confirm(\`Force-end match \${code}? Both players will be kicked.\`)) return;
  const secret = getSecret();
  if (!secret) return;
  const r = await fetch('/admin/matches/' + code + '/end', {
    method: 'POST',
    headers: { 'x-admin-secret': secret },
  });
  if (!r.ok) { const d = await r.json(); alert(d.error || 'Failed'); return; }
  await loadMatches();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function copyNewInvite() {
  copyLink(document.getElementById('new-invite-url').textContent, document.getElementById('new-invite-copy'));
}
function copyPairLink(elId, btn) {
  copyLink(document.getElementById(elId).textContent, btn);
}
function copyLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied ✓';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
  }).catch(() => { prompt('Copy this link:', url); });
}
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('new-name').addEventListener('keydown', e => { if (e.key === 'Enter') createTester(); });
  loadPlayers();
  loadMatches();
});
</script>
</body>
</html>`;
}
