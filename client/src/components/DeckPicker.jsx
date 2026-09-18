const PRESET_DECKS = [
  { type: 'preset', name: 'Even Hand' },
  { type: 'preset', name: 'The Wall' },
  { type: 'preset', name: 'Two Camps' },
  { type: 'preset', name: 'Weighted' },
];

const COLLECTION_OPT = { type: 'collection', name: 'My Collection' };

export default function DeckPicker({ deckOpt, onDeckOpt, customDecks = [] }) {
  const allOpts = [
    COLLECTION_OPT,
    ...customDecks.map(d => ({ type: 'custom', id: d.id, name: d.name })),
    ...PRESET_DECKS,
  ];

  const selected = allOpts.find(o => {
    if (o.type === 'collection') return deckOpt?.type === 'collection';
    if (o.type === 'preset') return deckOpt?.type === 'preset' && o.name === deckOpt.name;
    return deckOpt?.type === 'custom' && o.id === deckOpt.id;
  }) || allOpts[0];

  return (
    <div>
      <label>Deck</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
        {allOpts.map(opt => {
          const key = opt.type === 'collection' ? 'collection' : opt.type === 'preset' ? opt.name : opt.id;
          const isSel = opt.type === selected.type && (
            opt.type === 'preset' ? opt.name === selected.name : opt.type === 'collection' ? true : opt.id === selected.id
          );
          return (
            <div
              key={key}
              className={'deck-opt' + (isSel ? ' selected' : '')}
              onClick={() => onDeckOpt(opt)}
              style={opt.type === 'custom' ? { borderColor: 'rgba(99,102,241,.35)' } : {}}
            >
              <div className="deck-opt-name">{opt.name}</div>
              {opt.type === 'collection' && (
                <div style={{ fontSize: 9, color: 'var(--g-green)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', marginTop: 2 }}>
                  Minted cards
                </div>
              )}
              {opt.type === 'custom' && (
                <div style={{ fontSize: 9, color: 'var(--g-accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', marginTop: 2 }}>
                  Custom
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
