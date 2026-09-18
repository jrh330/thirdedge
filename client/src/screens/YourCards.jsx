import { useState } from 'react';
import Card from '../components/Card.jsx';
import PrimaryButton from '../components/PrimaryButton.jsx';
import { FAMILY_COLORS } from '../lib/families.jsx';
import { deleteCard } from '../lib/api.js';

function TrashIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,4 14,4" />
      <path d="M5 4V2h6v2" />
      <rect x="3" y="4" width="10" height="10" rx="1.5" />
      <line x1="6" y1="7" x2="6" y2="11" />
      <line x1="10" y1="7" x2="10" y2="11" />
    </svg>
  );
}

function CardTile({ card, isActive, inactiveCards, onDeleted }) {
  const [confirming, setConfirming]     = useState(false);
  const [replacementId, setReplacementId] = useState(null);
  const [busy, setBusy]                 = useState(false);
  const [error, setError]               = useState(null);

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    const result = await deleteCard(card.id, replacementId || undefined).catch(e => ({ error: e.message }));
    setBusy(false);
    if (result?.ok) {
      onDeleted(card.id);
    } else {
      setError(result?.error || 'Delete failed');
    }
  };

  const handleCancel = () => {
    setConfirming(false);
    setReplacementId(null);
    setError(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      <Card card={card} state="revealed" size="md" imageSrc={card.imageUrl || null} />

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          style={{
            background: 'none',
            border: '1px solid rgba(246,240,250,.15)',
            borderRadius: 6,
            padding: '5px 12px',
            fontSize: 12,
            color: 'var(--muted)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <TrashIcon /> Delete
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
            Delete "{card.name}"?
          </span>

          {/* Replacement picker — only for active cards that have inactive ones available */}
          {isActive && inactiveCards?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>
                Activate instead
              </span>
              {inactiveCards.map(ic => (
                <button
                  key={ic.id}
                  onClick={() => setReplacementId(prev => prev === ic.id ? null : ic.id)}
                  style={{
                    background: replacementId === ic.id ? 'var(--stock)' : 'transparent',
                    border: `1.5px solid ${replacementId === ic.id ? 'var(--pink)' : 'rgba(246,240,250,.15)'}`,
                    borderRadius: 8,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    textAlign: 'left',
                  }}
                >
                  {ic.imageUrl && (
                    <img src={ic.imageUrl} alt={ic.name} style={{ width: 28, height: 39, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                  )}
                  <span style={{ fontSize: 12, color: 'var(--key)', fontWeight: 600, lineHeight: 1.3 }}>
                    {ic.name}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
            <button
              onClick={handleDelete}
              disabled={busy}
              style={{
                background: '#ff4444',
                border: 'none',
                borderRadius: 6,
                padding: '5px 12px',
                fontSize: 12,
                color: '#fff',
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.5 : 1,
                fontFamily: 'inherit',
                fontWeight: 600,
              }}
            >
              {busy ? '…' : 'Yes, delete'}
            </button>
            <button
              onClick={handleCancel}
              style={{
                background: 'none',
                border: '1px solid rgba(246,240,250,.2)',
                borderRadius: 6,
                padding: '5px 12px',
                fontSize: 12,
                color: 'var(--muted)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
          </div>
          {error && <span style={{ fontSize: 12, color: '#ff4444', textAlign: 'center' }}>{error}</span>}
        </div>
      )}
    </div>
  );
}

export default function YourCards({ collection, onMakeAnother, onRefresh }) {
  if (!collection) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>
        Loading…
      </div>
    );
  }

  const { active = [], inactive = [], total = 0, families = {} } = collection;

  const handleDeleted = () => {
    onRefresh?.();
  };

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
            gap: 24,
          }}>
            {active.map(card => (
              <CardTile key={card.id} card={card} isActive inactiveCards={inactive} onDeleted={handleDeleted} />
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
            gap: 24,
          }}>
            {inactive.map(card => (
              <CardTile key={card.id} card={card} onDeleted={handleDeleted} />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
