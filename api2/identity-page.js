'use strict';

/**
 * identity-page.js
 *
 * Renders the server-side HTML identity/claim page.
 * Used by join-invite errors, /g/:code with no session, and claim failures.
 *
 * identityPage({ heading, message, next, hint, error })
 */

/**
 * confirmPage({ playerName, token, next })
 *
 * "Continue as Maya?" — shown when a valid invite token is visited but the
 * device has no session cookie for that player. Lets the visitor confirm
 * they are who the link says they are before the session is set.
 *
 * "Continue" POSTs to /claim with the token.
 * "I'm someone else" goes to /play which will show the identity/claim page.
 */
function confirmPage({ playerName, token, next = '/play' } = {}) {
  const safeName = escHtml(playerName || 'this account');
  const safeNext = escHtml(next);
  const safeToken = escHtml(token || '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Allagaroo</title>
  <link rel="icon" href="/mint/favicon.ico" sizes="any">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap">
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
      max-width: 400px;
    }
    .logo { font-size: 13px; font-weight: 700; color: #C84B8F; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 24px; }
    h1 { font-size: 22px; font-weight: 800; line-height: 1.2; margin-bottom: 8px; }
    .name { color: #C84B8F; }
    .msg { color: #9B8AAE; font-size: 14px; line-height: 1.6; margin-bottom: 28px; }
    .btn-primary {
      display: block; width: 100%;
      background: #C84B8F; border: none; border-radius: 10px;
      color: #fff; font-size: 15px; font-weight: 700; font-family: inherit;
      padding: 12px; cursor: pointer; letter-spacing: .3px; text-align: center;
      margin-bottom: 10px;
    }
    .btn-primary:hover { background: #D9569E; }
    .btn-ghost {
      display: block; width: 100%;
      background: none; border: 1px solid rgba(246,240,250,.14); border-radius: 10px;
      color: #9B8AAE; font-size: 14px; font-weight: 600; font-family: inherit;
      padding: 11px; cursor: pointer; text-align: center; text-decoration: none;
    }
    .btn-ghost:hover { border-color: rgba(246,240,250,.3); color: #F6F0FA; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Allagaroo</div>
    <h1>Continue as <span class="name">${safeName}</span>?</h1>
    <p class="msg">This link belongs to <strong>${safeName}</strong>. If that's you, tap Continue to sign in.</p>
    <form method="POST" action="/claim">
      <input type="hidden" name="code" value="${safeToken}">
      <input type="hidden" name="next" value="${safeNext}">
      <button class="btn-primary" type="submit">Continue as ${safeName}</button>
    </form>
    <a class="btn-ghost" href="/play">I'm someone else</a>
  </div>
</body>
</html>`;
};

function identityPage({ heading, message, next = '/play', hint = '', error = '' } = {}) {
  const safeNext    = escHtml(next);
  const safeHint    = hint   ? escHtml(hint)    : '';
  const safeError   = error  ? escHtml(error)   : '';
  const safeHeading = escHtml(heading || 'This device isn\'t signed in.');
  const safeMessage = escHtml(message || 'Paste your invite link or code below to continue.');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Allagaroo</title>
  <link rel="icon" href="/mint/favicon.ico" sizes="any">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap">
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
      max-width: 400px;
    }
    .logo {
      font-size: 13px;
      font-weight: 700;
      color: #C84B8F;
      letter-spacing: .06em;
      text-transform: uppercase;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 22px;
      font-weight: 800;
      line-height: 1.2;
      margin-bottom: 8px;
    }
    .msg {
      color: #9B8AAE;
      font-size: 14px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    ${safeHint ? `.hint {
      font-size: 12px;
      color: #7A6A8A;
      background: rgba(246,240,250,.04);
      border: 1px solid rgba(246,240,250,.08);
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 20px;
      line-height: 1.5;
    }` : ''}
    label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #9B8AAE;
      letter-spacing: .04em;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    input[type=text] {
      width: 100%;
      background: rgba(246,240,250,.06);
      border: 1px solid rgba(246,240,250,.14);
      border-radius: 10px;
      color: #F6F0FA;
      font-size: 15px;
      font-family: inherit;
      padding: 11px 14px;
      outline: none;
      margin-bottom: 4px;
    }
    input[type=text]:focus { border-color: rgba(246,240,250,.35); }
    .field-hint {
      font-size: 12px;
      color: #7A6A8A;
      margin-bottom: 16px;
    }
    .error-msg {
      font-size: 13px;
      color: #FF6B6B;
      margin-bottom: 14px;
      padding: 10px 12px;
      background: rgba(255,107,107,.08);
      border: 1px solid rgba(255,107,107,.2);
      border-radius: 8px;
    }
    button[type=submit] {
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
    button[type=submit]:hover { background: #D9569E; }
    .ask {
      font-size: 12px;
      color: #7A6A8A;
      text-align: center;
      margin-top: 18px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Allagaroo</div>
    <h1>${safeHeading}</h1>
    <p class="msg">${safeMessage}</p>
    ${safeHint ? `<div class="hint">${safeHint}</div>` : ''}
    ${safeError ? `<div class="error-msg">${safeError}</div>` : ''}
    <form method="POST" action="/claim">
      <input type="hidden" name="next" value="${safeNext}">
      <label for="code">Your invite code or link</label>
      <input
        type="text"
        id="code"
        name="code"
        placeholder="Paste link or type code"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        autofocus
      >
      <p class="field-hint">Paste the full link, or just the code at the end of it.</p>
      <button type="submit">Continue →</button>
    </form>
    <p class="ask">Don't have a link? Ask Jonathan.</p>
  </div>
  <script>
    // If a full URL is pasted, extract just the token path segment
    document.getElementById('code').addEventListener('input', function() {
      var v = this.value.trim();
      // Match /j/TOKEN or /join/TOKEN at end of a URL
      var m = v.match(/\\/(?:j|join)\\/([A-Za-z0-9_-]+)\\s*$/);
      if (m) this.value = m[1];
    });
  </script>
</body>
</html>`;
};

module.exports = identityPage;
module.exports.confirmPage = confirmPage;

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
