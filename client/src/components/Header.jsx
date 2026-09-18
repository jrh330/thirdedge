/**
 * Header — desktop + phone header with stepper.
 * Props: step (1|2|3), onBack (fn), backLabel (string)
 *
 * Desktop: logo left, stepper centre, "How families work" right.
 * Phone:   back arrow left, screen title centre, "N/3" right.
 */

import { useState } from 'react';

const STEP_LABELS = ['Make', 'Check', 'Mint'];

const FAMILIES = [
  {
    name: 'Vita',
    color: '#FF5A1F',
    bg: 'rgba(255,90,31,.12)',
    traits: ['Beast', 'Titan'],
    desc: 'Life-force and physical power. Cards with Beast or Titan traits belong to Vita.',
  },
  {
    name: 'Arte',
    color: '#7B4DFF',
    bg: 'rgba(123,77,255,.12)',
    traits: ['Machine', 'Icon'],
    desc: 'Craft, creativity, and constructed things. Machine and Icon traits belong to Arte.',
  },
  {
    name: 'Terra',
    color: '#FFD23F',
    bg: 'rgba(255,210,63,.12)',
    traits: ['Element', 'Spirit'],
    desc: 'The natural world and unseen forces. Element and Spirit traits belong to Terra.',
  },
];

function FamiliesModal({ onClose }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(17,9,25,.82)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#2A1C38', border: '1px solid rgba(246,240,250,.12)',
          borderRadius: 18, padding: 28, maxWidth: 420, width: '100%',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontWeight: 800, fontSize: 18, color: '#F6F0FA' }}>How families work</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#B7AAC6', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}
          >×</button>
        </div>

        <p style={{ fontSize: 13, color: '#B7AAC6', marginBottom: 20, lineHeight: 1.6 }}>
          Every card belongs to one of three families based on its trait. Families don't affect gameplay stats — they're part of your card's identity and collection makeup.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FAMILIES.map(f => (
            <div key={f.name} style={{ background: f.bg, border: `1px solid ${f.color}33`, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: f.color }}>{f.name}</span>
                <span style={{ fontSize: 11, color: '#B7AAC6', background: 'rgba(0,0,0,.25)', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
                  {f.traits.join(' · ')}
                </span>
              </div>
              <p style={{ fontSize: 13, color: '#F6F0FA', lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 12, color: '#B7AAC6', marginTop: 18, lineHeight: 1.6 }}>
          The AI assigns a trait when it checks your card. The trait determines the family automatically — you don't choose it.
        </p>
      </div>
    </div>
  );
}

function Stepper({ step }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
    }}>
      {STEP_LABELS.map((label, i) => {
        const s = i + 1;
        const done   = s < step;
        const active = s === step;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: done ? 0.55 : active ? 1 : 0.4,
            }}>
              <div style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: active ? 'var(--pink)' : done ? 'var(--stock)' : 'transparent',
                border: active ? 'none' : done ? '1.5px solid var(--muted)' : '1.5px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                color: active ? '#fff' : 'var(--muted)',
                flexShrink: 0,
              }}>
                {done ? '✓' : s}
              </div>
              <span style={{
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--key)' : 'var(--muted)',
              }}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div style={{
                width: 24,
                height: 1,
                background: 'var(--line)',
                margin: '0 4px',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function BackArrow() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <path d="M12 4L6 10L12 16" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const PHONE_TITLES = ['Make a card', 'It checked out', 'Minting…', 'Minted'];

export default function Header({ step = 1, onBack, backLabel, onPlay }) {
  const [showFamilies, setShowFamilies] = useState(false);
  const phoneTitle = PHONE_TITLES[step - 1] || '';

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 10,
      background: 'rgba(17,9,25,0.92)',
      backdropFilter: 'blur(8px)',
      borderBottom: '1px solid var(--line)',
    }}>
      {/* Desktop layout */}
      <div className="header-desktop" style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '0 24px',
        height: 55,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <img
          src="/mint/logo/svg/allagaroo-logo.svg"
          alt="Allagaroo"
          style={{ height: 44 }}
          onError={e => {
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'block';
          }}
        />
        <span style={{ display: 'none', fontFamily: "'Bagel Fat One', sans-serif", fontSize: 20, color: 'var(--pink)' }}>
          Allagaroo
        </span>

        <Stepper step={step} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
            }}
            onClick={() => setShowFamilies(true)}
          >
            How families work
          </button>
          {onPlay && (
            <button
              style={{
                background: 'var(--pink)',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                padding: '7px 16px',
                letterSpacing: '.3px',
              }}
              onClick={onPlay}
            >
              Play →
            </button>
          )}
        </div>
      </div>

      {showFamilies && <FamiliesModal onClose={() => setShowFamilies(false)} />}

      {/* Phone layout */}
      <div className="header-phone" style={{
        padding: '0 16px',
        height: 51,
        display: 'none',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {onBack ? (
          <button
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--key)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 14,
              fontFamily: 'inherit',
              padding: '4px 0',
            }}
          >
            <BackArrow />
            {backLabel || 'Back'}
          </button>
        ) : (
          <div style={{ width: 60 }} />
        )}

        <span style={{ fontSize: 16, fontWeight: 600 }}>{phoneTitle}</span>

        {onPlay ? (
          <button
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--pink)',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: '4px 0',
            }}
            onClick={onPlay}
          >
            Play →
          </button>
        ) : (
          <span style={{
            fontSize: 14,
            color: 'var(--muted)',
            fontWeight: 600,
            fontFamily: "'Rubik', sans-serif",
          }}>
            {Math.min(step, 3)}/3
          </span>
        )}
      </div>

      <style>{`
        @media (max-width: 640px) {
          .header-desktop { display: none !important; }
          .header-phone   { display: flex !important; }
        }
      `}</style>
    </header>
  );
}
