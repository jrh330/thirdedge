import { useState, useEffect, useRef, useCallback } from 'react';
import Card from '../components/Card.jsx';
import CharCounter from '../components/CharCounter.jsx';
import CollectionStrip from '../components/CollectionStrip.jsx';
import PrimaryButton from '../components/PrimaryButton.jsx';
import SecondaryButton from '../components/SecondaryButton.jsx';
import { validateSubmission, NAME_MAX, FLAVOR_MAX } from '../lib/game.js';
import { saveDraft } from '../lib/draft.js';

/**
 * Make screen — Step 1.
 * Props:
 *   draft          — { name, flavorText, imageBlob } | null
 *   onDraftChange  — fn({ name, flavorText, imageBlob })
 *   onImageSelect  — fn(File) — called when user selects an image
 *   onSubmit       — fn({ name, flavorText, imageBlob })
 *   collection     — collection state object from server
 *   checkResult    — null normally; populated if returning from a decline
 */
export default function Make({ draft, onDraftChange, onImageSelect, onSubmit, collection, checkResult }) {
  const [name, setName]             = useState(draft?.name || '');
  const [flavorText, setFlavorText] = useState(draft?.flavorText || '');
  const [imageBlob, setImageBlob]   = useState(draft?.imageBlob || null);
  const [imageSrc, setImageSrc]     = useState(null);
  const [errors, setErrors]         = useState({});
  const fileInputRef = useRef(null);
  const saveTimer    = useRef(null);

  // Rebuild imageSrc URL when imageBlob changes
  useEffect(() => {
    if (!imageBlob) { setImageSrc(null); return; }
    const url = URL.createObjectURL(imageBlob);
    setImageSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [imageBlob]);

  // Sync from draft prop on mount
  useEffect(() => {
    if (draft) {
      setName(draft.name || '');
      setFlavorText(draft.flavorText || '');
      setImageBlob(draft.imageBlob || null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced draft save
  const scheduleSave = useCallback((n, ft, ib) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraft({ name: n, flavorText: ft, imageBlob: ib }).catch(() => {});
      onDraftChange?.({ name: n, flavorText: ft, imageBlob: ib });
    }, 500);
  }, [onDraftChange]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const handleNameChange = e => {
    const val = e.target.value;
    setName(val);
    setErrors(prev => ({ ...prev, name: null }));
    scheduleSave(val, flavorText, imageBlob);
  };

  const handleFlavorChange = e => {
    const val = e.target.value;
    setFlavorText(val);
    setErrors(prev => ({ ...prev, flavorText: null }));
    scheduleSave(name, val, imageBlob);
  };

  const handleFileChange = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    onImageSelect?.(file);
  };

  const handlePictureClick = () => {
    fileInputRef.current?.click();
  };

  const allFilled = name.trim() && flavorText.trim() && imageBlob;
  const validation = validateSubmission({ name, flavorText });
  const canSubmit = allFilled && validation.ok;

  const handleSubmit = () => {
    const v = validateSubmission({ name, flavorText });
    if (!v.ok) {
      setErrors({ submit: v.reason });
      return;
    }
    if (!imageBlob) {
      setErrors({ submit: 'Please add a picture' });
      return;
    }
    onSubmit?.({ name: name.trim(), flavorText: flavorText.trim(), imageBlob });
  };

  // Show declined/error state if returning from a check
  const showDeclinedCard = checkResult && (checkResult.status === 'declined' || checkResult.status === 'error');
  const cardState = showDeclinedCard ? 'grey' : 'draft';
  const cardStamp = showDeclinedCard
    ? (checkResult.status === 'declined' ? 'declined' : 'error')
    : null;

  const draftCard = { name, family: null, kind: null };

  return (
    <div style={{
      maxWidth: 1100,
      margin: '0 auto',
      padding: '32px 24px',
      display: 'flex',
      gap: 48,
      alignItems: 'flex-start',
    }}>
      {/* Left: Card preview */}
      <div className="make-card-col" style={{ flexShrink: 0 }}>
        <Card
          card={showDeclinedCard ? draftCard : draftCard}
          state={cardState}
          stamp={cardStamp}
          size="lg"
          imageSrc={imageSrc}
        />
      </div>

      {/* Right: Form */}
      <div style={{ flex: 1, maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Step 1 of 3
        </p>
        <h1 style={{ fontSize: 32, fontFamily: "'Bagel Fat One', sans-serif", color: 'var(--key)', lineHeight: 1.1 }}>
          Make a card
        </h1>

        {/* Picture button */}
        <button
          onClick={handlePictureClick}
          style={{
            background: imageBlob ? 'var(--stock)' : 'var(--stock)',
            border: '2px dashed rgba(246,240,250,.25)',
            borderRadius: 12,
            padding: imageSrc ? 0 : '24px 20px',
            cursor: 'pointer',
            color: 'var(--muted)',
            fontSize: 15,
            fontFamily: 'inherit',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 80,
          }}
        >
          {imageSrc ? (
            <img
              src={imageSrc}
              alt="Card picture"
              style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <span>+ Add a picture</span>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* Name input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>Name</label>
            <CharCounter current={name.length} max={NAME_MAX} />
          </div>
          <input
            type="text"
            value={name}
            onChange={handleNameChange}
            maxLength={NAME_MAX + 5}
            placeholder="Give it a name"
            style={{
              background: 'var(--stock)',
              border: `1.5px solid ${errors.name ? '#ff4444' : 'var(--line)'}`,
              borderRadius: 8,
              padding: '12px 14px',
              fontSize: 16,
              color: 'var(--key)',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          {errors.name && <span style={{ color: '#ff4444', fontSize: 13 }}>{errors.name}</span>}
        </div>

        {/* About it textarea */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>About it</label>
            <CharCounter current={flavorText.length} max={FLAVOR_MAX} />
          </div>
          <textarea
            value={flavorText}
            onChange={handleFlavorChange}
            maxLength={FLAVOR_MAX + 5}
            placeholder="What is it? What makes it special?"
            rows={4}
            style={{
              background: 'var(--stock)',
              border: `1.5px solid ${errors.flavorText ? '#ff4444' : 'var(--line)'}`,
              borderRadius: 8,
              padding: '12px 14px',
              fontSize: 16,
              color: 'var(--key)',
              fontFamily: 'inherit',
              resize: 'vertical',
              outline: 'none',
              lineHeight: 1.5,
            }}
          />
          {errors.flavorText && <span style={{ color: '#ff4444', fontSize: 13 }}>{errors.flavorText}</span>}
        </div>

        {/* Collection strip */}
        <CollectionStrip collection={collection} />

        {/* Submit error */}
        {errors.submit && (
          <p style={{ color: '#ff4444', fontSize: 14, margin: 0 }}>{errors.submit}</p>
        )}

        {/* CTA */}
        <PrimaryButton onClick={handleSubmit} disabled={!canSubmit}>
          Check it
        </PrimaryButton>

        {/* Show Edit link if returning from declined */}
        {showDeclinedCard && checkResult.status === 'declined' && (
          <SecondaryButton onClick={() => setErrors({})}>
            Edit
          </SecondaryButton>
        )}
      </div>

      <style>{`
        @media (max-width: 640px) {
          .make-card-col { display: none; }
        }
      `}</style>
    </div>
  );
}
