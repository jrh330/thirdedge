/**
 * ResumeBanner — shown on any screen when the player has a live match.
 * Props:
 *   liveMatch — { code, status, role, p1Name, p2Name } | null
 *   onResume  — fn() called when user clicks Rejoin
 */
export default function ResumeBanner({ liveMatch, onResume }) {
  if (!liveMatch) return null;

  const opponentName = liveMatch.role === 'creator' ? liveMatch.p2Name : liveMatch.p1Name;
  const isWaiting    = liveMatch.status === 'waiting';

  const label = isWaiting
    ? `Game ${liveMatch.code} — waiting for opponent`
    : `Match with ${opponentName || 'opponent'} in progress`;

  return (
    <div style={bannerStyle}>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{label}</span>
      <button onClick={onResume} style={btnStyle}>
        Rejoin →
      </button>
    </div>
  );
}

const bannerStyle = {
  background: 'var(--pink)',
  color: '#fff',
  padding: '10px 20px',
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  position: 'sticky',
  top: 0,
  zIndex: 50,
};

const btnStyle = {
  background: 'rgba(255,255,255,.2)',
  border: '1px solid rgba(255,255,255,.35)',
  borderRadius: 8,
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  fontFamily: 'inherit',
  padding: '6px 14px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};
