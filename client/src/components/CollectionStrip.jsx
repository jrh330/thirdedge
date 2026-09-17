import { FAMILY_COLORS } from '../lib/families.jsx';

/**
 * CollectionStrip — shows collection totals and family chip counts.
 * Props:
 *   collection      — object from /api2/collection-state
 *   highlightFamily — family name to outline after a mint (optional)
 */
export default function CollectionStrip({ collection, highlightFamily }) {
  if (!collection) return null;

  const { total, active, families } = collection;
  const totalMax  = 20;
  const activeMax = 12;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{
        display: 'flex',
        gap: 16,
        fontSize: 14,
        color: 'var(--muted)',
        fontWeight: 500,
      }}>
        <span>{total ?? 0} of {totalMax} cards</span>
        <span>{active ?? 0} of {activeMax} active</span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['Vita', 'Terra', 'Arte'].map(fam => {
          const count = families?.[fam] ?? 0;
          const colors = FAMILY_COLORS[fam];
          const isHighlighted = highlightFamily === fam;

          return (
            <div key={fam} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 6,
              background: isHighlighted ? colors.bg : 'var(--stock)',
              color: isHighlighted ? colors.text : 'var(--muted)',
              border: isHighlighted ? `1.5px solid ${colors.bg}` : '1.5px solid transparent',
              fontSize: 13,
              fontWeight: 600,
              transition: 'all 0.2s',
            }}>
              {fam} {count}
            </div>
          );
        })}
      </div>
    </div>
  );
}
