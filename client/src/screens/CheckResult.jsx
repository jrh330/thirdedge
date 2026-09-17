import { useEffect, useState } from 'react';
import Card from '../components/Card.jsx';
import PrimaryButton from '../components/PrimaryButton.jsx';
import SecondaryButton from '../components/SecondaryButton.jsx';
import CollectionStrip from '../components/CollectionStrip.jsx';
import { FAMILY_COLORS } from '../lib/families.jsx';

/**
 * CheckResult screen — shown after checkSubmission returns.
 * Props:
 *   checkResult   — { status, submissionId, checkPayload, reason, matchedName, ... }
 *   draft         — { name, flavorText, imageBlob }
 *   croppedBlob   — Blob | null
 *   onMint        — fn() — user confirms Mint
 *   onEdit        — fn() — user wants to Edit
 *   collection    — collection state
 */
export default function CheckResult({ checkResult, draft, croppedBlob, onMint, onEdit, onRetry, onYourCards, collection }) {
  const [imageSrc, setImageSrc] = useState(null);

  useEffect(() => {
    const blob = croppedBlob || draft?.imageBlob;
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setImageSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [croppedBlob, draft?.imageBlob]);

  const status = checkResult?.status;
  const payload = checkResult?.checkPayload;

  // Build a card-like object for sealed/grey states
  const cardData = {
    name: draft?.name,
    family: payload?.family || null,
    kind:   payload?.kind || null,
  };

  if (status === 'allowed') {
    const famColor = FAMILY_COLORS[payload?.family] || {};

    return (
      <div style={layoutStyle}>
        <div className="result-card-col" style={{ flexShrink: 0 }}>
          <Card
            card={cardData}
            state="sealed"
            size="lg"
            imageSrc={imageSrc}
          />
        </div>

        <div style={formColStyle}>
          <p style={stepLabelStyle}>Step 2 of 3</p>
          <h1 style={h1Style}>It checked out</h1>

          {payload?.readAs && (
            <p style={{ fontSize: 17, color: 'var(--key)', fontStyle: 'italic' }}>
              "{payload.readAs}"
            </p>
          )}

          {payload?.family && (
            <p style={{ fontSize: 15, color: 'var(--muted)' }}>
              Scored as{' '}
              <span style={{ color: famColor.bg || 'var(--key)', fontWeight: 700 }}>
                {payload.family}
              </span>
              {payload.kind && <span> · {payload.kind}</span>}
            </p>
          )}

          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5, padding: '10px 14px', background: 'var(--stock)', borderRadius: 8 }}>
            Minting is final. The numbers come from your words and picture.
          </p>

          <CollectionStrip collection={collection} />

          <PrimaryButton onClick={onMint}>
            Mint it
          </PrimaryButton>
          <SecondaryButton onClick={onEdit}>
            Edit
          </SecondaryButton>
        </div>

        <style>{MOBILE_HIDE_CARD_CSS}</style>
      </div>
    );
  }

  if (status === 'already_made') {
    return (
      <div style={layoutStyle}>
        <div className="result-card-col" style={{ flexShrink: 0 }}>
          <Card card={cardData} state="grey" stamp="already_made" size="lg" imageSrc={imageSrc} />
        </div>
        <div style={formColStyle}>
          <h1 style={h1Style}>Already made</h1>
          <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5 }}>
            You've already minted a card with this name and description.
            {checkResult.matchedName && checkResult.matchedName !== draft?.name && (
              <span> It was called "{checkResult.matchedName}".</span>
            )}
          </p>
          <SecondaryButton onClick={onEdit}>Edit</SecondaryButton>
        </div>
        <style>{MOBILE_HIDE_CARD_CSS}</style>
      </div>
    );
  }

  if (status === 'declined') {
    return (
      <div style={layoutStyle}>
        <div className="result-card-col" style={{ flexShrink: 0 }}>
          <Card card={cardData} state="grey" stamp="declined" size="lg" imageSrc={imageSrc} />
        </div>
        <div style={formColStyle}>
          <h1 style={h1Style}>Can't mint this one</h1>
          {checkResult.category && (
            <p style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {checkResult.category}
            </p>
          )}
          {checkResult.message && (
            <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5 }}>
              {checkResult.message}
            </p>
          )}
          <SecondaryButton onClick={onEdit}>Edit</SecondaryButton>
        </div>
        <style>{MOBILE_HIDE_CARD_CSS}</style>
      </div>
    );
  }

  if (status === 'in_review') {
    return (
      <div style={layoutStyle}>
        <div className="result-card-col" style={{ flexShrink: 0 }}>
          <Card card={cardData} state="grey" stamp="in_review" size="lg" imageSrc={imageSrc} />
        </div>
        <div style={formColStyle}>
          <h1 style={h1Style}>In review</h1>
          <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5 }}>
            Someone will take a look — we'll let you know.
          </p>
          <SecondaryButton onClick={onEdit}>Make another</SecondaryButton>
        </div>
        <style>{MOBILE_HIDE_CARD_CSS}</style>
      </div>
    );
  }

  if (status === 'rate_limited') {
    return (
      <div style={layoutStyle}>
        <div className="result-card-col" style={{ flexShrink: 0 }}>
          <Card card={cardData} state="grey" stamp="error" size="lg" imageSrc={imageSrc} />
        </div>
        <div style={formColStyle}>
          <h1 style={h1Style}>Try again later</h1>
          <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5 }}>
            You've sent too many requests. Your draft is saved.
          </p>
          <SecondaryButton onClick={onEdit}>Edit</SecondaryButton>
        </div>
        <style>{MOBILE_HIDE_CARD_CSS}</style>
      </div>
    );
  }

  if (status === 'collection_full') {
    return (
      <div style={layoutStyle}>
        <div className="result-card-col" style={{ flexShrink: 0 }}>
          <Card card={cardData} state="grey" stamp="error" size="lg" imageSrc={imageSrc} />
        </div>
        <div style={formColStyle}>
          <h1 style={h1Style}>Collection full</h1>
          <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5 }}>
            You've reached 20 cards. Delete a card from Your Cards to make room.
          </p>
          <SecondaryButton onClick={onYourCards || onEdit}>Your cards</SecondaryButton>
        </div>
        <style>{MOBILE_HIDE_CARD_CSS}</style>
      </div>
    );
  }

  // error / fallback
  return (
    <div style={layoutStyle}>
      <div className="result-card-col" style={{ flexShrink: 0 }}>
        <Card card={cardData} state="grey" stamp="error" size="lg" imageSrc={imageSrc} />
      </div>
      <div style={formColStyle}>
        <h1 style={h1Style}>Something went wrong</h1>
        <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5 }}>
          Something went wrong on our side, not with your card. Nothing was saved or scored.
        </p>
        {(checkResult?.reason || checkResult?.error) && (
          <p style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>
            {checkResult.reason || checkResult.error}
          </p>
        )}
        <PrimaryButton onClick={onRetry || onEdit}>Try again</PrimaryButton>
        <SecondaryButton onClick={onEdit}>Edit</SecondaryButton>
      </div>
      <style>{MOBILE_HIDE_CARD_CSS}</style>
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const layoutStyle = {
  maxWidth: 1100,
  margin: '0 auto',
  padding: '32px 24px',
  display: 'flex',
  gap: 48,
  alignItems: 'flex-start',
};

const formColStyle = {
  flex: 1,
  maxWidth: 420,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const stepLabelStyle = {
  fontSize: 13,
  color: 'var(--muted)',
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
};

const h1Style = {
  fontSize: 32,
  fontFamily: "'Bagel Fat One', sans-serif",
  color: 'var(--key)',
  lineHeight: 1.1,
};

const MOBILE_HIDE_CARD_CSS = `
  @media (max-width: 640px) {
    .result-card-col { display: none; }
  }
`;
