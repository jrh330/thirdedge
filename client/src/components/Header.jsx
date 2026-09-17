/**
 * Header — desktop + phone header with stepper.
 * Props: step (1|2|3), onBack (fn), backLabel (string)
 *
 * Desktop: logo left, stepper centre, "How families work" right.
 * Phone:   back arrow left, screen title centre, "N/3" right.
 */

const STEP_LABELS = ['Make', 'Check', 'Mint'];

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

export default function Header({ step = 1, onBack, backLabel }) {
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
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <img
          src="/mint/logo/svg/allagaroo-logo.svg"
          alt="Allagaroo"
          style={{ height: 28 }}
          onError={e => {
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'block';
          }}
        />
        <span style={{ display: 'none', fontFamily: "'Bagel Fat One', sans-serif", fontSize: 20, color: 'var(--pink)' }}>
          Allagaroo
        </span>

        <Stepper step={step} />

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
          onClick={() => {/* TODO: families modal */}}
        >
          How families work
        </button>
      </div>

      {/* Phone layout */}
      <div className="header-phone" style={{
        padding: '0 16px',
        height: 56,
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

        <span style={{
          fontSize: 14,
          color: 'var(--muted)',
          fontWeight: 600,
          fontFamily: "'Rubik', sans-serif",
        }}>
          {Math.min(step, 3)}/3
        </span>
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
