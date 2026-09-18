export default function RevealResult({ ms, p1, p2, cards }) {
  const r = ms?.round;
  if (!r || r.phase !== 'reveal' || !r.lastResult) return null;
  const res = r.lastResult;
  const lp  = r.lastPlayed;
  const lc  = r.lastCategories;

  // Map player IDs to "a"/"b" by round.players order
  const sideKey = (pid) => r.players[0].playerId === pid ? 'a' : 'b';
  const winnerPid = res.winner ? r.players[res.winner === 'a' ? 0 : 1].playerId : null;

  function PlayerReveal({ pid, pname }) {
    const key    = sideKey(pid);
    const side   = res[key] || {};
    const cat    = lc?.[pid];
    const played = lp?.[pid];
    const c = cards?.[played];
    const won  = winnerPid === pid;
    const tied = !res.winner;
    const total = cat ? (side.totals?.[cat] ?? '?') : '?';
    const resultColor = won ? 'var(--g-green)' : tied ? 'var(--g-muted)' : 'var(--g-red)';
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        {c?.imageUrl && (
          <img src={c.imageUrl} alt={c.name}
            style={{
              width: '100%', height: 80, objectFit: 'cover', borderRadius: 8, marginBottom: 6,
              display: 'block', border: `2px solid ${resultColor}`,
            }} />
        )}
        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, color: resultColor }}>
          {pname} {won ? '✓' : tied ? '—' : '✗'}
        </div>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{c?.name || played}</div>
        {c?.kind && <div style={{ fontSize: 10, color: 'var(--g-muted)', marginBottom: 4 }}>{c.kind}</div>}
        {cat && <div style={{ fontSize: 11, color: 'var(--g-accent)', marginBottom: 4 }}>[ {cat.toUpperCase()} ]</div>}
        {side.bonded  && <div style={{ fontSize: 11, color: 'var(--g-vita)' }}>Bond +1</div>}
        {side.blocked && <div style={{ fontSize: 11, color: 'var(--g-red)' }}>Blocked</div>}
        <div style={{ fontSize: 11, color: 'var(--g-muted)', marginTop: 4 }}>
          Total {cat}: <span style={{ color: 'var(--g-text)', fontWeight: 700 }}>{total}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, color: resultColor }}>
          Hit: {side.hit > 0 ? '+' + side.hit : side.hit ?? 0}
        </div>
      </div>
    );
  }

  const awardMsg = winnerPid
    ? `+${res.stakeAwarded} pts to ${winnerPid === p1.id ? p1.name : p2.name}`
    : `Tie — stake grows to ${res.newStake}`;

  return (
    <div className="reveal-box g-fade">
      <div style={{ display: 'flex', gap: 14, marginBottom: 8 }}>
        <PlayerReveal pid={p1.id} pname={p1.name} />
        <div style={{ width: 1, background: 'var(--g-border)' }} />
        <PlayerReveal pid={p2.id} pname={p2.name} />
      </div>
      <div style={{
        borderTop: '1px solid var(--g-border)', paddingTop: 8, fontSize: 12,
        color: 'var(--g-gold)', fontWeight: 700, textAlign: 'center',
      }}>
        {awardMsg}
      </div>
    </div>
  );
}
