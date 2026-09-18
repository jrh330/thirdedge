import Card from './Card.jsx';

export default function AnchorArea({ cardId, cards, label }) {
  const c = cards?.[cardId];

  return (
    <div>
      <div style={{
        fontSize: 10, color: 'var(--muted)', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8,
      }}>
        {label || 'Anchor'}
      </div>
      {c ? (
        <Card card={c} state="revealed" size="md" imageSrc={c.imageUrl || null} />
      ) : (
        <div style={{
          width: 200, height: 280, borderRadius: 17,
          border: '2px dashed var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--muted)', fontSize: 12,
        }}>
          —
        </div>
      )}
    </div>
  );
}
