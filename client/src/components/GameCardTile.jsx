import { cardFamily, famClass } from '../lib/gameUtils.js';

export default function GameCardTile({ cardId, cards, selected, disabled, onClick }) {
  const c = cards?.[cardId];
  if (!c) {
    return (
      <div className="g-card-tile disabled">
        <span style={{ color: 'var(--g-muted)', fontSize: 11 }}>{cardId}</span>
      </div>
    );
  }

  const stats = [['POW', c.power], ['SPD', c.speed], ['WIT', c.wits]];
  const maxVal = Math.max(c.power, c.speed, c.wits);
  const fam = cardFamily(c);
  const famCls = famClass(c);

  return (
    <div
      className={'g-card-tile' + (selected ? ' selected' : '') + (disabled ? ' disabled' : '')}
      onClick={!disabled ? onClick : undefined}
      style={{ padding: c.imageUrl ? '0' : undefined, overflow: c.imageUrl ? 'hidden' : undefined }}
    >
      {c.imageUrl && (
        <img src={c.imageUrl} alt={c.name}
          style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }} />
      )}
      <div style={{ padding: c.imageUrl ? '8px 10px 10px' : undefined }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
          <div>
            <span className="card-name">{c.name}</span>
            {c.kind && <div style={{ fontSize: 10, color: 'var(--g-muted)', marginTop: 1, fontWeight: 500 }}>{c.kind}</div>}
          </div>
          {fam && (
            <span className={`badge badge-${famCls}`} style={{ flexShrink: 0, marginTop: 1 }}>{fam}</span>
          )}
        </div>
        <div className="card-stats">
          {stats.map(([l, v]) => (
            <div className="stat" key={l}>
              <div className="stat-label">{l}</div>
              <div className={'stat-val' + (v === maxVal ? ' max' : '')}>{v}</div>
            </div>
          ))}
        </div>
        {c.flavorText && (
          <div style={{
            fontSize: 10, color: 'var(--g-muted)', fontStyle: 'italic', marginTop: 6, lineHeight: 1.4,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            "{c.flavorText}"
          </div>
        )}
      </div>
    </div>
  );
}
