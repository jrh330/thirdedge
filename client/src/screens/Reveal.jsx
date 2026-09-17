import { useState, useEffect } from 'react';
import Card from '../components/Card.jsx';
import PrimaryButton from '../components/PrimaryButton.jsx';
import SecondaryButton from '../components/SecondaryButton.jsx';
import CollectionStrip from '../components/CollectionStrip.jsx';
import { FAMILY_COLORS, FamilyIcon } from '../lib/families.jsx';
import { swapCard } from '../lib/api.js';

export default function Reveal({ mintResult, croppedBlob, draft, collection, onMakeAnother, onYourCards }) {
  const [imageSrc, setImageSrc] = useState(null);
  const [placementChoice, setPlacementChoice] = useState('inactive');
  const [swapDone, setSwapDone] = useState(false);
  const [swapError, setSwapError] = useState(null);
  const [swapBusy, setSwapBusy] = useState(false);

  useEffect(() => {
    if (mintResult?.card?.imageUrl) {
      setImageSrc(mintResult.card.imageUrl);
      return;
    }
    const blob = croppedBlob || draft?.imageBlob;
    if (blob) {
      const url = URL.createObjectURL(blob);
      setImageSrc(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [mintResult, croppedBlob, draft?.imageBlob]);

  if (!mintResult?.card) return null;

  const { card, placement } = mintResult;

  const showSheet = placement?.placement === 'choice' && !swapDone;

  const handleDone = async () => {
    if (placementChoice === 'inactive') {
      setSwapDone(true);
      return;
    }
    setSwapBusy(true);
    setSwapError(null);
    try {
      const result = await swapCard({ outId: placementChoice, inId: card.id });
      if (result.ok) {
        setSwapDone(true);
      } else {
        setSwapError(result.error || 'Swap failed — try from Your cards.');
      }
    } catch (e) {
      setSwapError(e.message || 'Network error');
    } finally {
      setSwapBusy(false);
    }
  };

  // Placement message for the text column
  let placementMsg = null;
  if (placement?.placement === 'active') {
    placementMsg = `Added to your active cards (${placement.activeCount} of 12).`;
  } else if (placement?.placement === 'inactive') {
    placementMsg = `Added to your inactive cards. ${placement.reason || ''}`.trim();
  } else if (placement?.placement === 'choice' && swapDone) {
    placementMsg = placementChoice === 'inactive'
      ? 'Kept in your inactive cards.'
      : 'Swapped in — good pick.';
  }

  return (
    <>
      {/* ── Main reveal ── */}
      <div style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '32px 24px',
        display: 'flex',
        gap: 48,
        alignItems: 'flex-start',
      }}>
        {/* Left: card */}
        <div className="reveal-card-col" style={{ flexShrink: 0 }}>
          <Card card={card} state="revealed" size="lg" imageSrc={imageSrc} />
        </div>

        {/* Right: details */}
        <div style={{ flex: 1, maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Minted
          </p>
          <h1 style={{ fontSize: 32, fontFamily: "'Bagel Fat One', sans-serif", color: 'var(--key)', lineHeight: 1.1 }}>
            {card.name}
          </h1>

          {/* Stat line */}
          <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5 }}>
            Power {card.power} · Speed {card.speed} · Wits {card.wits}
            {'  '}
            <span style={{ opacity: 0.7 }}>{card.family} · {card.kind}</span>
          </p>

          {/* AI reasoning */}
          {card.aiReasoning && (
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5, fontStyle: 'italic' }}>
              "{card.aiReasoning}"
            </p>
          )}

          {/* Scored against chips */}
          {card.aiAnchors?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Scored against
              </span>
              {card.aiAnchors.map(a => (
                <span key={a} style={{
                  fontSize: 13,
                  padding: '3px 10px',
                  borderRadius: 6,
                  background: 'var(--stock)',
                  color: 'var(--key)',
                  border: '1px solid var(--line)',
                }}>
                  {a}
                </span>
              ))}
            </div>
          )}

          {/* Placement result */}
          {placementMsg && (
            <p style={{ fontSize: 14, color: placement?.placement === 'active' ? 'var(--key)' : 'var(--muted)', fontWeight: 500 }}>
              {placementMsg}
            </p>
          )}

          {/* Collection strip */}
          <CollectionStrip collection={collection} highlightFamily={card.family} />

          <PrimaryButton onClick={onMakeAnother}>Make another</PrimaryButton>
          <SecondaryButton onClick={onYourCards}>Your cards</SecondaryButton>
        </div>
      </div>

      {/* ── Placement sheet overlay ── */}
      {showSheet && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          background: 'rgba(17,9,25,0.72)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--bg)',
            borderTop: '1px solid var(--line)',
            borderRadius: '20px 20px 0 0',
            padding: '24px 24px 48px',
            width: '100%',
            maxWidth: 600,
            maxHeight: '78vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            <h2 style={{ fontSize: 22, fontFamily: "'Bagel Fat One', sans-serif", color: 'var(--key)', margin: 0 }}>
              Where does it go?
            </h2>
            {placement.reason && (
              <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>{placement.reason}</p>
            )}

            {/* Keep inactive row */}
            <button
              onClick={() => setPlacementChoice('inactive')}
              style={{
                background: placementChoice === 'inactive' ? 'var(--stock)' : 'transparent',
                border: `2px solid ${placementChoice === 'inactive' ? 'var(--pink)' : 'var(--line)'}`,
                borderRadius: 12,
                padding: '14px 16px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: 'var(--key)',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600 }}>Keep it inactive</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
                {placement.inactiveCount} of 8 inactive. Swap it in later.
              </div>
            </button>

            {/* Inline confirm — shown when Keep inactive is selected */}
            {placementChoice === 'inactive' && (
              <button
                onClick={handleDone}
                disabled={swapBusy}
                style={{
                  background: 'var(--pink)',
                  border: 'none',
                  borderRadius: 10,
                  padding: '13px 20px',
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#fff',
                  cursor: swapBusy ? 'default' : 'pointer',
                  opacity: swapBusy ? 0.5 : 1,
                  fontFamily: 'inherit',
                  width: '100%',
                }}
              >
                {swapBusy ? 'Saving…' : 'Yes, keep inactive →'}
              </button>
            )}

            {/* Swap candidates */}
            {placement.swapOptions?.length > 0 && (
              <>
                <p style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', margin: '4px 0 0' }}>
                  Or swap it in for…
                </p>
                {placement.swapOptions.map(target => {
                  const famColors = FAMILY_COLORS[target.family] || {};
                  const selected = placementChoice === target.id;
                  return (
                    <button
                      key={target.id}
                      onClick={() => setPlacementChoice(target.id)}
                      style={{
                        background: selected ? 'var(--stock)' : 'transparent',
                        border: `2px solid ${selected ? 'var(--pink)' : 'var(--line)'}`,
                        borderRadius: 12,
                        padding: '10px 14px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        textAlign: 'left',
                        display: 'flex',
                        gap: 12,
                        alignItems: 'center',
                      }}
                    >
                      {/* Thumbnail */}
                      <div style={{
                        width: 42, height: 59,
                        borderRadius: 6,
                        background: 'var(--stock)',
                        border: '1px solid var(--line)',
                        flexShrink: 0,
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        {target.imageUrl ? (
                          <img src={target.imageUrl} alt={target.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <img src="/mint/logo/svg/allagaroo-mark-small.svg" alt="" style={{ width: '60%', opacity: 0.25, filter: 'brightness(3)' }} />
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--key)' }}>{target.name}</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px 2px 6px',
                            borderRadius: 999,
                            background: famColors.bg || 'var(--stock)',
                            color: famColors.text || 'var(--key)',
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: '.08em',
                            textTransform: 'uppercase',
                          }}>
                            <FamilyIcon family={target.family} size={11} />
                            {target.family}
                          </span>
                          <span style={{ fontSize: 13, color: 'var(--muted)', fontFamily: "'Rubik', sans-serif", fontWeight: 600 }}>
                            {target.power}/{target.speed}/{target.wits}
                          </span>
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Becomes inactive</span>
                      </div>
                    </button>
                  );
                })}
              </>
            )}

            {swapError && (
              <p style={{ color: '#ff4444', fontSize: 13, margin: 0 }}>{swapError}</p>
            )}

            <PrimaryButton onClick={handleDone} disabled={swapBusy}>
              {swapBusy ? 'Saving…' : 'Done'}
            </PrimaryButton>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 640px) {
          .reveal-card-col { display: none; }
        }
      `}</style>
    </>
  );
}
