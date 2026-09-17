import { useState } from 'react';
import Card from '../components/Card.jsx';
import PrimaryButton from '../components/PrimaryButton.jsx';
import SecondaryButton from '../components/SecondaryButton.jsx';
import CollectionStrip from '../components/CollectionStrip.jsx';

/**
 * Reveal screen — shows the minted card after Mint succeeds.
 * Props:
 *   mintResult    — { card, placement }
 *   collection    — collection state
 *   onMakeAnother — fn()
 *   onYourCards   — fn()
 */
export default function Reveal({ mintResult, collection, onMakeAnother, onYourCards }) {
  const [placementChoice, setPlacementChoice] = useState(null);

  if (!mintResult?.card) return null;

  const { card, placement } = mintResult;

  const imageSrc = card?.imageUrl || null;

  // Placement messaging
  let placementMsg = null;
  if (placement?.placement === 'active') {
    placementMsg = `Added to your active cards (${placement.activeCount} of 12).`;
  } else if (placement?.placement === 'inactive') {
    placementMsg = `Added to your inactive cards. ${placement.reason || ''}`;
  } else if (placement?.placement === 'choice') {
    placementMsg = `${placement.reason} — choose where it goes.`;
  }

  return (
    <div style={{
      maxWidth: 1100,
      margin: '0 auto',
      padding: '32px 24px',
      display: 'flex',
      gap: 48,
      alignItems: 'flex-start',
    }}>
      {/* Left: revealed card */}
      <div className="reveal-card-col" style={{ flexShrink: 0 }}>
        <Card
          card={card}
          state="revealed"
          size="lg"
          imageSrc={imageSrc}
        />
      </div>

      {/* Right: details */}
      <div style={{ flex: 1, maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Minted
        </p>
        <h1 style={{ fontSize: 32, fontFamily: "'Bagel Fat One', sans-serif", color: 'var(--key)', lineHeight: 1.1 }}>
          Here it is.
        </h1>

        {/* Stats — big Rubik */}
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
          {[
            { label: 'PWR', val: card.power },
            { label: 'SPD', val: card.speed },
            { label: 'WIT', val: card.wits  },
          ].map(({ label, val }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: "'Rubik', sans-serif", fontWeight: 500 }}>
                {label}
              </span>
              <span style={{ fontSize: 40, fontFamily: "'Rubik', sans-serif", fontWeight: 700, lineHeight: 1, color: 'var(--key)' }}>
                {val}
              </span>
            </div>
          ))}
          <div style={{ marginLeft: 8, marginBottom: 4, color: 'var(--muted)', fontSize: 14, fontStyle: 'italic' }}>
            {card.family} · {card.kind}
          </div>
        </div>

        {/* AI reasoning */}
        {card.aiReasoning && (
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5, fontStyle: 'italic' }}>
            "{card.aiReasoning}"
          </p>
        )}

        {/* Placement */}
        {placementMsg && (
          <p style={{ fontSize: 14, color: 'var(--key)', fontWeight: 500 }}>
            {placementMsg}
          </p>
        )}

        {/* Placement choice sheet */}
        {placement?.placement === 'choice' && (
          <div style={{
            background: 'var(--stock)',
            borderRadius: 12,
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Choose a slot:</p>
            {placement.swapOptions?.map(targetId => (
              <button
                key={targetId}
                onClick={() => setPlacementChoice(targetId)}
                style={{
                  background: placementChoice === targetId ? 'var(--pink)' : 'var(--bg)',
                  color: placementChoice === targetId ? '#fff' : 'var(--key)',
                  border: '1.5px solid var(--line)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
              >
                Swap for {targetId}
              </button>
            ))}
            <button
              onClick={() => setPlacementChoice('inactive')}
              style={{
                background: placementChoice === 'inactive' ? 'var(--stock)' : 'transparent',
                color: 'var(--muted)',
                border: '1.5px solid var(--line)',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 14,
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              Keep it inactive
            </button>
          </div>
        )}

        {/* Collection strip — highlight new card's family */}
        <CollectionStrip collection={collection} highlightFamily={card.family} />

        <PrimaryButton onClick={onMakeAnother}>
          Make another
        </PrimaryButton>
        <SecondaryButton onClick={onYourCards}>
          Your cards
        </SecondaryButton>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .reveal-card-col { display: none; }
        }
      `}</style>
    </div>
  );
}
