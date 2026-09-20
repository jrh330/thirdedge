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
    const cardCounts = await db.collection('cardsv2')
      .aggregate([
        { $match: { ownerId: { $in: playerIds } } },
        { $group: { _id: '$ownerId', count: { $sum: 1 } } },
      ]).toArray();

    const countById = Object.fromEntries(cardCounts.map(c => [c._id, c.count]));
    const baseUrl = process.env.PUBLIC_BASE_URL || `https://${req.hostname}`;

    const result = players.map(p => ({
      id:        p.id,
      name:      p.name,
      joinUrl:   p.token ? `${baseUrl}/join/${p.token}` : null,
      token:     p.token || null,
      cardCount: countById[p.id] || 0,
      revoked:   !!p.revokedAt,
      createdAt: p.createdAt,
    }));

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

  /* ── Header ── */
  header {
    background: rgba(17,9,21,.92);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid rgba(246,240,250,.08);
    padding: 0 24px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 10;
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

  /* ── Page body ── */
  .page { max-width: 860px; margin: 0 auto; padding: 32px 20px 0; }

  /* ── Stats row ── */
  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 32px;
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

  /* ── Add tester ── */
  .add-section {
    background: #1E1228;
    border: 1px solid rgba(246,240,250,.08);
    border-radius: 14px;
    padding: 22px 20px;
    margin-bottom: 28px;
  }
  .section-title {
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 14px;
    color: #F6F0FA;
  }
  .add-row {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .add-row input {
    flex: 1;
    background: rgba(246,240,250,.06);
    border: 1px solid rgba(246,240,250,.14);
    border-radius: 10px;
    color: #F6F0FA;
    font-size: 14px;
    padding: 10px 13px;
    outline: none;
    font-family: inherit;
  }
  .add-row input:focus { border-color: rgba(246,240,250,.35); }
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

  /* New invite result */
  .new-invite {
    display: none;
    margin-top: 14px;
    background: rgba(200,75,143,.1);
    border: 1px solid rgba(200,75,143,.3);
    border-radius: 10px;
    padding: 14px 16px;
  }
  .new-invite.show { display: block; }
  .new-invite-label { font-size: 12px; color: #C84B8F; font-weight: 700; margin-bottom: 8px; letter-spacing: .5px; text-transform: uppercase; }
  .new-invite-name { font-size: 15px; font-weight: 700; margin-bottom: 10px; }
  .link-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .link-text {
    flex: 1;
    background: rgba(246,240,250,.06);
    border: 1px solid rgba(246,240,250,.1);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12px;
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
    padding: 8px 14px;
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
  }
  .table-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
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
    padding: 12px 20px;
    border-bottom: 1px solid rgba(246,240,250,.08);
  }
  td {
    padding: 14px 20px;
    font-size: 14px;
    border-bottom: 1px solid rgba(246,240,250,.05);
    vertical-align: middle;
  }
  tr:last-child td { border-bottom: none; }
  tr.revoked td { opacity: .45; }

  .badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .4px;
    padding: 3px 9px;
    border-radius: 20px;
    text-transform: uppercase;
  }
  .badge-active { background: rgba(52,199,89,.15); color: #34C759; border: 1px solid rgba(52,199,89,.3); }
  .badge-revoked { background: rgba(255,107,107,.1); color: #FF6B6B; border: 1px solid rgba(255,107,107,.2); }

  .action-btn {
    background: none;
    border: 1px solid rgba(246,240,250,.14);
    border-radius: 7px;
    color: #9B8AAE;
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    padding: 5px 12px;
    cursor: pointer;
  }
  .action-btn:hover { border-color: rgba(246,240,250,.3); color: #F6F0FA; }
  .action-btn.revoke:hover { border-color: rgba(255,107,107,.5); color: #FF6B6B; }
  .action-btn.restore:hover { border-color: rgba(52,199,89,.5); color: #34C759; }

  .no-link { color: #9B8AAE; font-size: 12px; font-style: italic; }

  /* mobile: hide Cards column, compress */
  @media (max-width: 580px) {
    .col-cards { display: none; }
    td, th { padding: 12px 14px; }
  }

  .empty-state {
    text-align: center;
    padding: 48px 20px;
    color: #9B8AAE;
    font-size: 14px;
  }
  #loading { text-align: center; padding: 48px 20px; color: #9B8AAE; font-size: 14px; }
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
  <div class="stats" id="stats">
    <div class="stat"><div class="stat-val" id="stat-total">—</div><div class="stat-label">Total testers</div></div>
    <div class="stat"><div class="stat-val" id="stat-active" style="color:#34C759">—</div><div class="stat-label">Active</div></div>
    <div class="stat"><div class="stat-val" id="stat-revoked" style="color:#FF6B6B">—</div><div class="stat-label">Revoked</div></div>
    <div class="stat"><div class="stat-val" id="stat-cards" style="color:#C84B8F">—</div><div class="stat-label">Cards minted</div></div>
  </div>

  <!-- Add tester -->
  <div class="add-section">
    <div class="section-title">Add a tester</div>
    <div class="add-row">
      <input type="text" id="new-name" placeholder="Tester's name" maxlength="40">
      <button class="btn-pink" id="create-btn" onclick="createTester()">Create invite</button>
    </div>
    <div class="new-invite" id="new-invite">
      <div class="new-invite-label">Invite created</div>
      <div class="new-invite-name" id="new-invite-name"></div>
      <div class="link-row">
        <div class="link-text" id="new-invite-url"></div>
        <button class="btn-copy" id="new-invite-copy" onclick="copyNewInvite()">Copy</button>
      </div>
      <p style="font-size:12px;color:#9B8AAE;margin-top:10px">Send this link to the tester. They tap it once and they're in — no account needed.</p>
    </div>
  </div>

  <!-- Tester table -->
  <div class="table-wrap">
    <div class="table-header">
      <span class="section-title" style="margin:0">Testers</span>
    </div>
    <div id="table-body">
      <div id="loading">Loading…</div>
    </div>
  </div>

</div>

<script>
let players = [];
let adminSecret = null;

// We derive the admin secret from the cookie (already set) — calls use the cookie,
// but we still need x-admin-secret for the invite/revoke endpoints.
// Prompt once and cache in sessionStorage.
function getSecret() {
  if (adminSecret) return adminSecret;
  adminSecret = sessionStorage.getItem('alg_admin_secret');
  if (!adminSecret) {
    adminSecret = prompt('Enter admin password to perform actions:');
    if (adminSecret) sessionStorage.setItem('alg_admin_secret', adminSecret);
  }
  return adminSecret;
}

async function loadPlayers() {
  try {
    const r = await fetch('/admin/players');
    if (!r.ok) { document.getElementById('table-body').innerHTML = '<div class="empty-state">Failed to load.</div>'; return; }
    players = await r.json();
    render();
  } catch(e) {
    document.getElementById('table-body').innerHTML = '<div class="empty-state">Error loading testers.</div>';
  }
}

function render() {
  const total   = players.length;
  const active  = players.filter(p => !p.revoked).length;
  const revoked = players.filter(p => p.revoked).length;
  const cards   = players.reduce((s, p) => s + (p.cardCount || 0), 0);

  document.getElementById('stat-total').textContent   = total;
  document.getElementById('stat-active').textContent  = active;
  document.getElementById('stat-revoked').textContent = revoked;
  document.getElementById('stat-cards').textContent   = cards;

  if (!players.length) {
    document.getElementById('table-body').innerHTML = '<div class="empty-state">No testers yet. Add one above.</div>';
    return;
  }

  let html = \`<table>
    <thead>
      <tr>
        <th>Name</th>
        <th class="col-cards">Cards</th>
        <th>Status</th>
        <th>Invite link</th>
        <th></th>
      </tr>
    </thead>
    <tbody>\`;

  for (const p of players) {
    const statusBadge = p.revoked
      ? '<span class="badge badge-revoked">Revoked</span>'
      : '<span class="badge badge-active">Active</span>';

    const linkCell = p.joinUrl
      ? \`<div class="link-row" style="gap:6px">
           <div class="link-text" style="font-size:11px">\${p.joinUrl}</div>
           <button class="btn-copy" onclick="copyLink('\${escHtml(p.joinUrl)}', this)">Copy</button>
         </div>\`
      : '<span class="no-link">No link on file</span>';

    const actionBtn = p.revoked
      ? \`<button class="action-btn restore" onclick="restorePlayer('\${p.id}')">Restore</button>\`
      : \`<button class="action-btn revoke" onclick="revokePlayer('\${escHtml(p.token || '')}')">Revoke</button>\`;

    html += \`<tr class="\${p.revoked ? 'revoked' : ''}">
      <td style="font-weight:600">\${escHtml(p.name)}</td>
      <td class="col-cards">\${p.cardCount}</td>
      <td>\${statusBadge}</td>
      <td>\${linkCell}</td>
      <td>\${p.token || p.revoked ? actionBtn : '<span class="no-link">—</span>'}</td>
    </tr>\`;
  }

  html += '</tbody></table>';
  document.getElementById('table-body').innerHTML = html;
}

async function createTester() {
  const name = document.getElementById('new-name').value.trim();
  if (!name) { document.getElementById('new-name').focus(); return; }

  const secret = getSecret();
  if (!secret) return;

  const btn = document.getElementById('create-btn');
  btn.disabled = true;
  btn.textContent = 'Creating…';

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
  } catch(e) {
    alert('Error: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create invite';
  }
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

function copyNewInvite() {
  const url = document.getElementById('new-invite-url').textContent;
  copyLink(url, document.getElementById('new-invite-copy'));
}

function copyLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied ✓';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
  }).catch(() => {
    prompt('Copy this link:', url);
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Allow pressing Enter in the name field
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('new-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') createTester();
  });
  loadPlayers();
});
</script>
</body>
</html>`;
}
