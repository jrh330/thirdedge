import { useEffect, useRef, useState } from 'react';
import { pollGame } from '../lib/api.js';
import { useGameToast } from '../components/GameToast.jsx';

export default function GameWait({ code, onOpponentJoined, onBack }) {
  const [copied, setCopied]  = useState(false);
  const [ToastEl, showToast] = useGameToast();
  const pollRef = useRef(null);

  const shareLink = window.location.origin + '/mint?code=' + code;
  const canShare  = !!navigator.share;

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
  }, [code, onOpponentJoined]);

  function handleShare() {
    if (canShare) {
      navigator.share({ title: 'Join my game', url: shareLink }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareLink).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }).catch(() => showToast('Could not copy', true));
    }
  }

  return (
    <div className="game-root">
      {ToastEl}
      <div className="g-screen">
        <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>

          {/* Spinner + heading */}
          <div style={{ textAlign: 'center' }}>
            <div className="g-spinner" style={{ margin: '0 auto 20px' }} />
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -.5, marginBottom: 6 }}>
              Waiting for opponent
            </div>
            <div style={{ color: 'var(--g-muted)', fontSize: 13 }}>
              Send them the code or the link below
            </div>
          </div>

          {/* Code hero */}
          <div style={{
            background: 'var(--g-surface)',
            border: '1px solid var(--g-border)',
            borderRadius: 18,
            padding: '24px 32px',
            textAlign: 'center',
            width: '100%',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--g-muted)', marginBottom: 10 }}>
              Game code
            </div>
            <div style={{
              fontSize: 52,
              fontWeight: 900,
              letterSpacing: 10,
              color: 'var(--g-accent)',
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {code}
            </div>
            <div style={{ fontSize: 11, color: 'var(--g-muted)', marginTop: 10 }}>
              Opponent goes to <strong style={{ color: 'var(--g-text)' }}>Play →</strong> and enters this code
            </div>
          </div>

          {/* Share / Copy */}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              className="g-btn g-btn-primary"
              style={{ width: '100%' }}
              onClick={handleShare}
            >
              {canShare ? 'Share link' : copied ? 'Copied!' : 'Copy link'}
            </button>
            <button className="g-btn g-btn-ghost" style={{ width: '100%' }} onClick={onBack}>
              Cancel
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
