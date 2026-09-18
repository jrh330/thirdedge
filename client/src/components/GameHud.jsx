export default function GameHud({ ms, p1, p2 }) {
  if (!ms) return null;
  const r = ms.round;
  const rw = ms.roundsWon;
  const phaseLabel = r.phase.replace('-', ' ');
  const phaseClass = {
    opening: 'phase-opening',
    commit: 'phase-commit',
    reveal: 'phase-reveal',
    over: 'phase-over',
    'exhausted-tied': 'phase-reveal',
  }[r.phase] || 'phase-commit';

  return (
    <div className="g-hud">
      <div className="hud-item">
        <div className="hud-val">{r.index}</div>
        <div className="hud-key">Round</div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 12 }}>{p1?.name}</div>
          <div className="pips">
            {[0, 1].map(i => (
              <div key={i} className={'g-pip' + (rw[p1?.id] > i ? ' won' : '')} />
            ))}
          </div>
        </div>
        <div style={{ color: 'var(--g-muted)', fontWeight: 700, fontSize: 11 }}>vs</div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontWeight: 700, fontSize: 12 }}>{p2?.name}</div>
          <div className="pips">
            {[0, 1].map(i => (
              <div key={i} className={'g-pip' + (rw[p2?.id] > i ? ' won' : '')} />
            ))}
          </div>
        </div>
      </div>
      <div className="hud-item">
        <div className="hud-val" style={{ color: 'var(--g-gold)' }}>{r.stake}</div>
        <div className="hud-key">Stake</div>
      </div>
      <div>
        <div className={'phase-banner ' + phaseClass}>{phaseLabel}</div>
      </div>
    </div>
  );
}
