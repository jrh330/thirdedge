import Card from '../components/Card.jsx';
import PrimaryButton from '../components/PrimaryButton.jsx';
import { FAMILY_COLORS } from '../lib/families.jsx';

export default function YourCards({ collection, onMakeAnother }) {
  if (!collection) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>
        Loading…
      </div>
    );
  }

  const { active = [], inactive = [], total = 0, families = {} } = collection;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 32, fontFamily: "'Bagel Fat One', sans-serif", color: 'var(--key)', lineHeight: 1.1, margin: 0 }}>
            Your cards
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 8 }}>
            {total} of 20 total · {active.length} active · {inactive.length} inactive
          </p>
          {/* Family breakdown */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {['Vita', 'Terra', 'Arte'].map(fam => {
              const count = families[fam] || 0;
              if (!count) return null;
              const colors = FAMILY_COLORS[fam];
              return (
                <span key={fam} style={{
                  fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                  background: colors.bg, color: colors.text,
                  letterSpacing: '.06em', textTransform: 'uppercase',
                }}>
                  {fam} {count}
                </span>
              );
            })}
          </div>
        </div>
        <PrimaryButton onClick={onMakeAnother} style={{ flexShrink: 0 }}>
          Make another
        </PrimaryButton>
      </div>

      {/* Active section */}
      {active.length > 0 && (
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 16 }}>
            Active · {active.length} of 12
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 16,
          }}>
            {active.map(card => (
              <Card key={card.id} card={card} state="revealed" size="md" imageSrc={card.imageUrl || null} />
            ))}
          </div>
        </section>
      )}

      {/* Inactive section */}
      {inactive.length > 0 && (
        <section>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 16 }}>
            Inactive · {inactive.length} of 8
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 16,
          }}>
            {inactive.map(card => (
              <Card key={card.id} card={card} state="dimmed" size="md" imageSrc={card.imageUrl || null} />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
