import { useEffect, useRef, useState } from 'react';
import { pollGame } from '../lib/api.js';
import { useGameToast } from '../components/GameToast.jsx';

export default function GameWait({ code, onOpponentJoined, onBack }) {
  const [copied, setCopied]  = useState(false);
  const [ToastEl, showToast] = useGameToast();
  const pollRef = useRef(null);

  const shareLink = window.location.origin + '/mint?code=' + code;

  useEffect(() => {
    async function poll() {
      try {
        const data = await pollGame(code);
        if (data.status === 'playing') {
          clearInterval(pollRef.current);
          onOpponentJoined({
            p1Id:   data.p1.id,
            p1Name: data.p1.name,
            p2Id:   data.p2.id,
            p2Name: data.p2.name,
          });
        }
      } catch {
        // ignore poll errors
      }
    }

    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => clearInterval(pollRef.current);
  }, [code]);

  function handleCopy() {
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => showToast('Could not copy', true));
  }

  return (
    <div className="game-root">
      {ToastEl}
      <div className="g-screen">
        <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, marginBottom: 6 }}>
            Waiting for opponent
          </div>
          <div style={{ color: 'var(--g-muted)', fontSize: 13, marginBottom: 28 }}>
            Share this link with your opponent
          </div>

          <div className="g-surface g-fade" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
            <div style={{
              background: 'var(--g-surface2)',
              border: '1px solid var(--g-border)',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 13,
              wordBreak: 'break-all',
              color: 'var(--g-text)',
              textAlign: 'left',
            }}>
              {shareLink}
            </div>
            <button className="g-btn g-btn-primary" onClick={handleCopy} style={{ width: '100%' }}>
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
            <div style={{ fontSize: 13, color: 'var(--g-muted)' }}>
              Game code: <strong style={{ color: 'var(--g-text)' }}>{code}</strong>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div className="g-spinner" />
            <div style={{ color: 'var(--g-muted)', fontSize: 13 }}>Waiting for opponent…</div>
            <button className="g-btn g-btn-ghost" onClick={onBack}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
