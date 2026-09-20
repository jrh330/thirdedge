import { useState } from 'react';

export default function NoSession() {
  const [code, setCode]     = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  async function handleClaim(e) {
    e.preventDefault();
    const raw = code.trim();
    if (!raw) { setError('Paste your invite link or type your code.'); return; }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/claim', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:        new URLSearchParams({ code: raw, next: '/play' }),
        redirect:    'manual',   // don't auto-follow — we'll navigate ourselves
      });

      // 2xx or opaque (manual redirect) both mean success
      if (res.ok || res.type === 'opaqueredirect' || res.status === 0) {
        window.location.href = '/play';
        return;
      }

      // Server returned an error page (HTML) — show a generic message
      setError('That code wasn\'t recognised. Check the link and try again.');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // If a full invite URL is pasted, strip it to just the token
  function handleInput(e) {
    let v = e.target.value;
    const m = v.match(/\/(?:j|join)\/([A-Za-z0-9_-]+)\s*$/);
    if (m) v = m[1];
    setCode(v);
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: 'var(--ink)',
    }}>
      <div style={{
        background: 'var(--stock)',
        border: '1px solid var(--line)',
        borderRadius: 16,
        padding: '36px 32px',
        width: '100%',
        maxWidth: 400,
      }}>
        <div style={{
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--pink)',
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          marginBottom: 24,
        }}>
          Allagaroo
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, marginBottom: 8 }}>
          This device isn't signed in.
        </h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 }}>
          Paste your invite link or code below to continue.
        </p>

        <form onSubmit={handleClaim}>
          <label style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--muted)',
            letterSpacing: '.04em',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}>
            Invite link or code
          </label>
          <input
            type="text"
            value={code}
            onChange={handleInput}
            placeholder="Paste link or type code"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            style={{
              width: '100%',
              background: 'rgba(246,240,250,.06)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              color: 'var(--key)',
              fontSize: 15,
              fontFamily: 'inherit',
              padding: '11px 14px',
              outline: 'none',
              marginBottom: 4,
            }}
          />
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: error ? 12 : 16 }}>
            Paste the full link, or just the code at the end of it.
          </p>

          {error && (
            <p style={{
              fontSize: 13,
              color: '#FF6B6B',
              marginBottom: 14,
              padding: '10px 12px',
              background: 'rgba(255,107,107,.08)',
              border: '1px solid rgba(255,107,107,.2)',
              borderRadius: 8,
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: 'var(--pink)',
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              fontFamily: 'inherit',
              padding: 12,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.6 : 1,
              letterSpacing: '.3px',
            }}
          >
            {loading ? 'Signing in…' : 'Continue →'}
          </button>
        </form>

        <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 18, lineHeight: 1.6 }}>
          Don't have a link? Ask Jonathan.
        </p>
      </div>
    </div>
  );
}
