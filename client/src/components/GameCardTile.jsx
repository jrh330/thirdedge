import Card from './Card.jsx';

export default function GameCardTile({ cardId, cards, selected, disabled, onClick }) {
  const c = cards?.[cardId];
  if (!c) {
    return (
      <div style={{
        width: 160, height: 224, borderRadius: 14,
        background: 'var(--stock)', border: '2px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: 0.4,
      }}>
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>{cardId}</span>
      </div>
    );
  }

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      style={{
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        display: 'inline-block',
        borderRadius: 14,
        outline: selected ? '3px solid var(--pink)' : '3px solid transparent',
        outlineOffset: 3,
        transition: 'outline-color .15s',
        userSelect: 'none',
      }}
    >
      <Card card={c} state="revealed" size="sm" imageSrc={c.imageUrl || null} />
    </div>
  );
}
