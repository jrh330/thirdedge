import { useEffect, useRef, useState } from 'react';
import Card from '../components/Card.jsx';
import ProgressRows from '../components/ProgressRows.jsx';
import SecondaryButton from '../components/SecondaryButton.jsx';

/**
 * Checking screen — shown while checkSubmission is in flight.
 * Props:
 *   draft         — { name, flavorText, imageBlob }
 *   croppedBlob   — Blob | null (used for card imageSrc)
 *   onEdit        — fn() — called if user taps Edit
 */
export default function Checking({ draft, croppedBlob, onEdit }) {
  const [progressStep, setProgressStep] = useState(1);
  const imageSrcRef = useRef(null);
  const [imageSrc, setImageSrc]         = useState(null);

  // Simulated progress: step 1 → 2 after 0.8s, step 2 → 3 after 1.6s total
  useEffect(() => {
    const t1 = setTimeout(() => setProgressStep(2), 800);
    const t2 = setTimeout(() => setProgressStep(3), 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Build image URL
  useEffect(() => {
    const blob = croppedBlob || draft?.imageBlob;
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    imageSrcRef.current = url;
    setImageSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [croppedBlob, draft?.imageBlob]);

  const draftCard = { name: draft?.name, family: null, kind: null };

  return (
    <div style={{
      maxWidth: 1100,
      margin: '0 auto',
      padding: '32px 24px',
      display: 'flex',
      gap: 48,
      alignItems: 'flex-start',
    }}>
      {/* Left: dimmed card */}
      <div className="checking-card-col" style={{ flexShrink: 0 }}>
        <Card
          card={draftCard}
          state="dimmed"
          size="lg"
          imageSrc={imageSrc}
        />
      </div>

      {/* Right: progress */}
      <div style={{ flex: 1, maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 28 }}>
        <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Step 2 of 3
        </p>
        <h1 style={{ fontSize: 32, fontFamily: "'Bagel Fat One', sans-serif", color: 'var(--key)', lineHeight: 1.1 }}>
          Checking…
        </h1>

        <ProgressRows step={progressStep} />

        <div style={{ marginTop: 8 }}>
          <SecondaryButton onClick={onEdit}>
            Edit
          </SecondaryButton>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .checking-card-col { display: none; }
        }
      `}</style>
    </div>
  );
}
