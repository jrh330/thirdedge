export default function GameHud({ ms, p1, p2 }) {
  if (!ms) return null;
  const r  = ms.round;
  const rw = ms.roundsWon;

  const phaseColor = {
    opening: 'var(--pink)',
    commit:  'var(--terra)',
    reveal:  'var(--win)',
    over:    '#EF4444',
    'exhausted-tied': 'var(--win)',
  }[r.phase] || 'var(--muted)';

  const phaseLabel = r.phase === 'opening' ? 'Opening' :
                     r.phase === 'commit'   ? 'Commit'  :
                     r.phase === 'reveal'   ? 'Reveal'  :
                     r.phase === 'over'     ? 'Over'    : r.phase;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 14px',
      background: 'var(--stock)',
      border: '1px solid var(--line)',
      borderRadius: 14,
    }}>
      {/* Logo */}
      <img
        src="/mint/logo/svg/allagaroo-mark-small.svg"
        alt="Allagaroo"
        style={{ height: 28, width: 28, flexShrink: 0 }}
      />

      {/* Players + pips */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div style={{ textAlign: 'right', minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--key)' }}>{p1?.name}</div>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginTop: 2 }}>
            {[0, 1].map(i => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: rw[p1?.id] > i ? 'var(--terra)' : 'var(--line)' }} />
            ))}
          </div>
        </div>
        <div style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 10, flexShrink: 0 }}>vs</div>
        <div style={{ textAlign: 'left', minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--key)' }}>{p2?.name}</div>
          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
            {[0, 1].map(i => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: rw[p2?.id] > i ? 'var(--terra)' : 'var(--line)' }} />
            ))}
          </div>
        </div>
      </div>

      {/* Round */}
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--key)', lineHeight: 1 }}>{r.index}</div>
        <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>Round</div>
      </div>

      {/* Stake */}
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--terra)', lineHeight: 1 }}>{r.stake}</div>
        <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>Stake</div>
      </div>

      {/* Phase */}
      <div style={{
        padding: '4px 10px', borderRadius: 8, flexShrink: 0,
        background: `${phaseColor}18`,
        border: `1px solid ${phaseColor}44`,
        fontSize: 10, fontWeight: 800, letterSpacing: '.6px',
        textTransform: 'uppercase', color: phaseColor,
        whiteSpace: 'nowrap',
      }}>
        {phaseLabel}
      </div>
    </div>
  );
}
