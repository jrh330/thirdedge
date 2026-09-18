import { cardFamily, famClass } from '../lib/gameUtils.js';

export default function AnchorArea({ cardId, cards, label }) {
  const c = cards?.[cardId];
  const stats = c ? [['POW', c.power], ['SPD', c.speed], ['WIT', c.wits]] : [];
  const maxVal = c ? Math.max(c.power, c.speed, c.wits) : 0;
  const fam = c ? cardFamily(c) : '';
  const famCls = fam ? famClass({ family: fam }) : '';

  return (
    <div className="anchor-area" style={{ padding: c?.imageUrl ? 0 : undefined, overflow: 'hidden' }}>
      {c?.imageUrl && (
        <img src={c.imageUrl} alt={c.name}
          style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} />
      )}
      <div style={{ padding: c?.imageUrl ? '8px 12px 10px' : undefined }}>
        <div className="anchor-label">{label || 'Anchor'}</div>
        {c ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 2 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{c.name}</span>
                {c.kind && <span style={{ fontSize: 10, color: 'var(--g-muted)', marginLeft: 5 }}>{c.kind}</span>}
              </div>
              {fam && (
                <span className={`badge badge-${famCls}`}>{fam}</span>
              )}
            </div>
            <div className="card-stats" style={{ marginTop: 6 }}>
              {stats.map(([l, v]) => (
                <div className="stat" key={l}>
                  <div className="stat-label">{l}</div>
                  <div className={'stat-val' + (v === maxVal ? ' max' : '')}>{v}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--g-muted)', fontSize: 12 }}>—</div>
        )}
      </div>
    </div>
  );
}
