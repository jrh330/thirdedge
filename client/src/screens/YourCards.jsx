import { useState } from 'react';
import Card from '../components/Card.jsx';
import PrimaryButton from '../components/PrimaryButton.jsx';
import { FAMILY_COLORS } from '../lib/families.jsx';
import { deleteCard, fillTestCards, removeTestCards, swapCard, repairCollection, deleteNoImageCards } from '../lib/api.js';

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

function CardTile({ card, isActive, inactiveCards, activeCards, onDeleted, onSwapped }) {
  const [confirming, setConfirming]     = useState(false);
  const [swapping, setSwapping]         = useState(false);   // inactive: pick which active to bench
  const [swapTarget, setSwapTarget]     = useState(null);    // active card id to bench
  const [replacementId, setReplacementId] = useState(null);
  const [busy, setBusy]                 = useState(false);
  const [error, setError]               = useState(null);

  const handleSwapConfirm = async () => {
    if (!swapTarget && isActive) return;
    setBusy(true);
    setError(null);
    // inactive card moves in, swapTarget moves out (or for active→bench, card moves out, pick one to bring in)
    const outId = isActive ? card.id : swapTarget;
    const inId  = isActive ? swapTarget : card.id;
    const result = await swapCard({ outId, inId }).catch(e => ({ error: e.message }));
    setBusy(false);
    if (result?.ok) {
      setSwapping(false);
      setSwapTarget(null);
      onSwapped?.();
    } else {
      const msg = result?.error || 'Swap failed';
      // "not in active/inactive" means stale state — refresh and let user retry
      if (msg.includes('is not in')) {
        setSwapping(false);
        setSwapTarget(null);
        setError('Card list was out of date — refreshed. Try again.');
        onSwapped?.(); // triggers collection refresh
      } else {
        setError(msg);
      }
    }
  };

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
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <Card card={card} state="revealed" size="md" imageSrc={card.imageUrl || null} />
        {card.isTestCard && (
          <div style={{
            position: 'absolute', top: 6, right: 6,
            background: 'rgba(27,16,38,0.82)', color: 'var(--terra)',
            fontSize: 9, fontWeight: 700, letterSpacing: '.14em',
            padding: '2px 7px', borderRadius: 4,
            textTransform: 'uppercase', pointerEvents: 'none',
            border: '1px solid var(--terra)',
          }}>
            Test
          </div>
        )}
      </div>

      {error && !swapping && !confirming && (
        <span style={{ fontSize: 12, color: '#ff4444', textAlign: 'center' }}>{error}</span>
      )}

      {!confirming && !swapping ? (
        <div style={{ display: 'flex', gap: 6 }}>
          {/* Swap button */}
          {!isActive && activeCards?.length > 0 && (
            <button
              onClick={() => { setSwapping(true); setError(null); }}
              style={{
                background: 'none',
                border: '1px solid rgba(246,240,250,.3)',
                borderRadius: 6,
                padding: '5px 12px',
                fontSize: 12,
                color: 'var(--key)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 600,
              }}
            >
              Make active
            </button>
          )}
          {isActive && inactiveCards?.length > 0 && (
            <button
              onClick={() => { setSwapping(true); setError(null); }}
              style={{
                background: 'none',
                border: '1px solid rgba(246,240,250,.15)',
                borderRadius: 6,
                padding: '5px 12px',
                fontSize: 12,
                color: 'var(--muted)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Bench
            </button>
          )}
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
        </div>
      ) : swapping ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
            {isActive ? `Bench "${card.name}" — activate which?` : `Activate "${card.name}" — bench which?`}
          </span>
          {(isActive ? inactiveCards : activeCards)?.map(other => (
            <button
              key={other.id}
              onClick={() => setSwapTarget(prev => prev === other.id ? null : other.id)}
              style={{
                background: swapTarget === other.id ? 'var(--stock)' : 'transparent',
                border: `1.5px solid ${swapTarget === other.id ? 'var(--pink)' : 'rgba(246,240,250,.15)'}`,
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
              {other.imageUrl && (
                <img src={other.imageUrl} alt={other.name} style={{ width: 28, height: 39, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
              )}
              <span style={{ fontSize: 12, color: 'var(--key)', fontWeight: 600, lineHeight: 1.3 }}>
                {other.name}
              </span>
            </button>
          ))}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
            <button
              onClick={handleSwapConfirm}
              disabled={busy || !swapTarget}
              style={{
                background: 'var(--pink)',
                border: 'none',
                borderRadius: 6,
                padding: '5px 12px',
                fontSize: 12,
                color: 'var(--ink)',
                cursor: busy || !swapTarget ? 'default' : 'pointer',
                opacity: busy || !swapTarget ? 0.5 : 1,
                fontFamily: 'inherit',
                fontWeight: 600,
              }}
            >
              {busy ? '…' : 'Swap'}
            </button>
            <button
              onClick={() => { setSwapping(false); setSwapTarget(null); setError(null); }}
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

export default function YourCards({ collection, onMakeAnother, onRefresh, onPlay }) {
  const [testBusy, setTestBusy] = useState(false);
  const [testError, setTestError] = useState(null);
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairMsg, setRepairMsg] = useState(null);
  const [noImageBusy, setNoImageBusy] = useState(false);
  const [noImageMsg, setNoImageMsg] = useState(null);

  if (!collection) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>
        Loading…
      </div>
    );
  }

  const { active = [], inactive = [], total = 0, families = {} } = collection;
  const needsTestCards = active.length < 12;
  const hasTestCards   = [...active, ...inactive].some(c => c.isTestCard);

  const handleDeleted = () => { onRefresh?.(); };

  const handleFill = async () => {
    setTestBusy(true);
    setTestError(null);
    const result = await fillTestCards().catch(e => ({ error: e.message }));
    setTestBusy(false);
    if (result?.error) { setTestError(result.error); return; }
    onRefresh?.();
  };

  const handleRemoveTest = async () => {
    setTestBusy(true);
    setTestError(null);
    const result = await removeTestCards().catch(e => ({ error: e.message }));
    setTestBusy(false);
    if (result?.error) { setTestError(result.error); return; }
    onRefresh?.();
  };

  const handleRepair = async () => {
    setRepairBusy(true);
    setRepairMsg(null);
    const result = await repairCollection().catch(e => ({ error: e.message }));
    setRepairBusy(false);
    if (result?.error) { setRepairMsg({ ok: false, text: result.error }); return; }
    setRepairMsg({ ok: true, text: result.message });
    onRefresh?.();
  };

  const handleDeleteNoImage = async () => {
    setNoImageBusy(true);
    setNoImageMsg(null);
    const result = await deleteNoImageCards().catch(e => ({ error: e.message }));
    setNoImageBusy(false);
    if (result?.error) { setNoImageMsg({ ok: false, text: result.error }); return; }
    setNoImageMsg({ ok: true, text: result.message });
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <PrimaryButton onClick={onMakeAnother} style={{ flexShrink: 0 }}>
              {total === 0 ? 'Make a card' : 'Make another'}
            </PrimaryButton>
            {onPlay && (
              <PrimaryButton onClick={onPlay} style={{ flexShrink: 0 }}>
                Play
              </PrimaryButton>
            )}
          </div>
          {needsTestCards && (
            <button
              onClick={handleFill}
              disabled={testBusy}
              style={{
                background: 'transparent',
                border: `1.5px solid var(--terra)`,
                borderRadius: 8,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--terra)',
                cursor: testBusy ? 'default' : 'pointer',
                opacity: testBusy ? 0.6 : 1,
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {testBusy ? '…' : `Fill ${12 - active.length} test card${12 - active.length !== 1 ? 's' : ''}`}
            </button>
          )}
          {hasTestCards && !testBusy && (
            <button
              onClick={handleRemoveTest}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: 12,
                color: 'var(--muted)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              Remove test cards
            </button>
          )}
          {testError && (
            <span style={{ fontSize: 12, color: '#ff4444', textAlign: 'right' }}>{testError}</span>
          )}
          {/* Collection repair tools */}
          <button
            onClick={handleRepair}
            disabled={repairBusy}
            style={{
              background: 'none', border: 'none', padding: 0,
              fontSize: 12, color: 'var(--muted)', cursor: repairBusy ? 'default' : 'pointer',
              fontFamily: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3,
              opacity: repairBusy ? 0.5 : 1,
            }}
          >
            {repairBusy ? '…' : 'Find missing cards'}
          </button>
          {repairMsg && (
            <span style={{ fontSize: 12, color: repairMsg.ok ? 'var(--muted)' : '#ff4444', textAlign: 'right' }}>
              {repairMsg.text}
            </span>
          )}
          <button
            onClick={handleDeleteNoImage}
            disabled={noImageBusy}
            style={{
              background: 'none', border: 'none', padding: 0,
              fontSize: 12, color: 'var(--muted)', cursor: noImageBusy ? 'default' : 'pointer',
              fontFamily: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3,
              opacity: noImageBusy ? 0.5 : 1,
            }}
          >
            {noImageBusy ? '…' : 'Delete cards without images'}
          </button>
          {noImageMsg && (
            <span style={{ fontSize: 12, color: noImageMsg.ok ? 'var(--muted)' : '#ff4444', textAlign: 'right' }}>
              {noImageMsg.text}
            </span>
          )}
        </div>
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
              <CardTile key={card.id} card={card} isActive inactiveCards={inactive} activeCards={active} onDeleted={handleDeleted} onSwapped={handleDeleted} />
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
              <CardTile key={card.id} card={card} activeCards={active} inactiveCards={inactive} onDeleted={handleDeleted} onSwapped={handleDeleted} />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
