import { FAMILY_COLORS, FamilyIcon } from '../lib/families.jsx';

// ── Size definitions ──────────────────────────────────────────────────────────
// All measurements derived from the 375×525 master; scale = w/375

const SIZES = {
  lg: {
    w: 375, h: 525, border: 15, radius: 32.5, picH: 345,
    nameSize: 36.2, kindSize: 20, statLabel: 18.8, statNum: 47.5, famSize: 16,
    famPadY: 7.5, famPadX: 20, famGap: 10, famRadius: 999,
    stampFont: 42.5, stampPad: [12.5, 22.5], stampRadius: 12.5, stampBorder: 6.2,
  },
  md: {
    w: 200, h: 280, border: 8, radius: 17.3, picH: 184,
    nameSize: 19.3, kindSize: 10.7, statLabel: 10, statNum: 25.3, famSize: 8.5,
    famPadY: 4, famPadX: 10.7, famGap: 5.3, famRadius: 999,
    stampFont: 22.7, stampPad: [6.7, 12], stampRadius: 6.7, stampBorder: 3.3,
  },
  sm: {
    w: 160, h: 224, border: 6, radius: 14, picH: 147,
    nameSize: 15, kindSize: 8, statLabel: 8, statNum: 20, famSize: 7,
    famPadY: 3, famPadX: 8, famGap: 4, famRadius: 999,
    stampFont: 18, stampPad: [5, 10], stampRadius: 5, stampBorder: 3,
  },
  'sm-back': { w: 62,  h: 87  },
  'xs-back': { w: 46,  h: 64  },
};

// ── Stamp text ────────────────────────────────────────────────────────────────

const STAMP_TEXT = {
  already_made: 'Already made',
  declined:     "Can't mint",
  in_review:    'In review',
  error:        'Not checked',
};

// ── Best stat helper ──────────────────────────────────────────────────────────

function bestStat(power, speed, wits) {
  let best = 'power', bestVal = power;
  if (speed > bestVal) { best = 'speed'; bestVal = speed; }
  if (wits  > bestVal) { best = 'wits'; }
  return best;
}

// ── Card back face ────────────────────────────────────────────────────────────

function CardBackFace({ w, h, owner = 'you' }) {
  const dotColor    = owner === 'opp' ? 'var(--teal)' : 'var(--pink)';
  const borderColor = owner === 'opp' ? 'var(--teal)' : 'var(--pink)';
  const scale   = w / 375;
  const radius  = Math.round(32.5 * scale);
  const border  = Math.max(1, Math.round(15 * scale));
  const markSize = Math.round(66 * scale);
  const ringW   = Math.max(1, Math.round(3 * scale));

  return (
    <div style={{
      width: w, height: h,
      borderRadius: radius,
      border: `${border}px solid ${borderColor}`,
      boxShadow: `0 0 0 ${Math.max(1, Math.round(5 * scale))}px var(--key)`,
      background: `
        radial-gradient(circle, ${dotColor} 1.26px, transparent 1.76px) 0 0 / 5px 5px,
        radial-gradient(circle, ${dotColor} 1.26px, transparent 1.76px) 2.5px 2.5px / 5px 5px,
        var(--stock)
      `,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      {/* A mark circle */}
      <div style={{
        width: markSize, height: markSize,
        borderRadius: '50%',
        background: 'var(--stock)',
        boxShadow: `0 0 0 ${ringW}px var(--key)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <img
          src="/mint/logo/svg/allagaroo-mark-small.svg"
          alt=""
          style={{ width: '80%', height: '80%', objectFit: 'contain' }}
        />
      </div>
    </div>
  );
}

// ── Main Card component ───────────────────────────────────────────────────────

/**
 * Card — renders a card in any state at any size.
 *
 * Props:
 *   card       — card data object (may be null for draft/back states)
 *   state      — 'draft' | 'sealed' | 'revealed' | 'dimmed' | 'grey' | 'back'
 *   stamp      — null | 'already_made' | 'declined' | 'in_review' | 'error'
 *   size       — 'lg' | 'md' | 'sm-back' | 'xs-back'
 *   owner      — 'you' | 'opp'
 *   imageSrc   — local object URL or server URL for the picture
 *   name       — draft name (used when card is null)
 *   flavorText — draft flavor text (unused in render, but kept for future)
 *
 * data-flip-state mirrors the state prop so a future flip CSS animation can
 * trigger on it without restructuring this component.
 * TODO: add flip animation CSS when animation step is reached.
 */
export default function Card({
  card        = null,
  state       = 'draft',
  stamp       = null,
  size        = 'lg',
  owner       = 'you',
  imageSrc    = null,
  name: draftName = '',
}) {
  const dims = SIZES[size];

  // sm-back / xs-back always render the back face
  if (size === 'sm-back' || size === 'xs-back') {
    return (
      <div data-flip-state={state} style={{ display: 'inline-block', flexShrink: 0 }}>
        <CardBackFace w={dims.w} h={dims.h} owner={owner} />
      </div>
    );
  }

  if (state === 'back') {
    return (
      <div data-flip-state={state} style={{ display: 'inline-block', flexShrink: 0 }}>
        <CardBackFace w={dims.w} h={dims.h} owner={owner} />
      </div>
    );
  }

  const {
    w, h, border, radius, picH,
    nameSize, kindSize, statLabel, statNum,
    famSize, famPadY, famPadX, famGap, famRadius,
    stampFont, stampPad, stampRadius, stampBorder,
  } = dims;

  const scale       = w / 375;
  const borderColor = owner === 'opp' ? 'var(--teal)' : 'var(--pink)';

  // Data with fallbacks
  const displayName = card?.name || draftName || '';
  const family      = card?.family || null;
  const kind        = card?.kind   || '';
  const power       = card?.power;
  const speed       = card?.speed;
  const wits        = card?.wits;

  const famStyle     = family ? (FAMILY_COLORS[family] || {}) : {};
  const showFamily   = state !== 'draft' && family;
  const showKind     = state !== 'draft' && kind;
  const showStats    = state === 'revealed';
  const statsSealed  = !showStats;  // show "?" when not revealed

  const best = showStats ? bestStat(power, speed, wits) : null;

  // Outer modifiers
  const outerFilter  = state === 'grey' ? 'grayscale(0.85) brightness(0.7)' : 'none';
  const outerOpacity = state === 'dimmed' ? 0.5 : 1;

  const statsH = h - picH - border * 2;

  return (
    <div
      data-flip-state={state}
      style={{
        position: 'relative',
        display: 'inline-block',
        flexShrink: 0,
        filter: outerFilter,
        opacity: outerOpacity,
      }}
    >
      {/* Card face */}
      <div style={{
        width: w, height: h,
        borderRadius: radius,
        border: `${border}px solid ${borderColor}`,
        boxShadow: `0 0 0 ${Math.round(5 * scale)}px var(--key), 0 ${Math.round(40*scale)}px ${Math.round(70*scale)}px -${Math.round(30*scale)}px rgba(0,0,0,.75)`,
        background: 'var(--stock)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>

        {/* ── PICTURE ZONE ── */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: picH,
          flexShrink: 0,
          overflow: 'hidden',
          boxShadow: `inset 0 -${Math.round(5 * scale)}px 0 var(--key)`,
        }}>
          {/* Picture fill */}
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={displayName}
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'cover', display: 'block',
              }}
            />
          ) : (
            /* Empty slot — no dots on card face */
            <div style={{
              position: 'absolute', inset: 0,
              background: 'var(--stock)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {state === 'draft' ? (
                <span style={{
                  fontSize: Math.round(14 * scale),
                  color: 'var(--muted)',
                  fontWeight: 600,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                }}>
                  Add a picture
                </span>
              ) : (
                /* Burst mark placeholder for sealed / revealed / dimmed / grey */
                <img
                  src="/mint/logo/svg/allagaroo-mark-small.svg"
                  alt=""
                  style={{ width: '30%', height: '30%', objectFit: 'contain', opacity: 0.2, filter: 'brightness(3)' }}
                />
              )}
            </div>
          )}

          {/* Family badge — top-left */}
          <div style={{
            position: 'absolute',
            top: Math.round(17.5 * scale),
            left: Math.round(17.5 * scale),
          }}>
            {showFamily ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: famGap,
                padding: `${famPadY}px ${famPadX}px ${famPadY}px ${Math.round(famPadX * 0.75)}px`,
                borderRadius: famRadius,
                background: famStyle.bg || 'var(--stock)',
                color: famStyle.text || 'var(--key)',
                boxShadow: `0 0 0 ${Math.round(3.8 * scale)}px var(--ink)`,
                fontFamily: "'Instrument Sans', system-ui, sans-serif",
                fontSize: famSize,
                fontWeight: 700,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}>
                <FamilyIcon family={family} size={famSize + 2} />
                {family}
              </div>
            ) : (
              /* Draft state: "?" badge */
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minWidth: Math.round(50 * scale),
                height: Math.round(37.5 * scale),
                padding: `0 ${Math.round(15 * scale)}px`,
                borderRadius: 999,
                background: 'rgba(27,16,38,.72)',
                boxShadow: `inset 0 0 0 ${Math.round(2.5 * scale)}px rgba(246,240,250,.6)`,
                color: 'var(--key)',
                fontFamily: "'Rubik', sans-serif",
                fontWeight: 700,
                fontSize: Math.round(22.5 * scale),
                lineHeight: 1,
              }}>?</div>
            )}
          </div>

          {/* Name + kind — bottom gradient overlay */}
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            padding: `${Math.round(40 * scale)}px ${Math.round(22.5 * scale)}px ${Math.round(17.5 * scale)}px`,
            background: 'linear-gradient(180deg, rgba(27,16,38,0) 0%, rgba(27,16,38,.88) 60%)',
            display: 'flex', flexDirection: 'column',
            gap: Math.round(7.5 * scale),
          }}>
            <span style={{
              fontFamily: "'Bagel Fat One', 'Arial Black', system-ui, sans-serif",
              fontSize: nameSize,
              lineHeight: 1.02,
              color: 'var(--key)',
              textWrap: 'balance',
              wordBreak: 'break-word',
            }}>
              {displayName || '\u00A0'}
            </span>
            {showKind && (
              <span style={{
                fontFamily: "'Instrument Sans', sans-serif",
                fontSize: kindSize,
                fontWeight: 600,
                lineHeight: 1,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: 'rgba(246,240,250,.72)',
              }}>
                {kind}
              </span>
            )}
          </div>
        </div>

        {/* ── STATS ROW ── */}
        <div style={{
          height: statsH,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: Math.round(10 * scale),
          padding: `${Math.round(10 * scale)}px ${Math.round(20 * scale)}px ${Math.round(20 * scale)}px`,
        }}>
          {[
            { key: 'power', label: 'POW', val: power },
            { key: 'speed', label: 'SPD', val: speed },
            { key: 'wits',  label: 'WIT', val: wits  },
          ].map(({ key, label, val }) => {
            const isBest    = showStats && best === key;
            const isSealed  = statsSealed;

            let bg         = 'transparent';
            let boxShadow  = `inset 0 0 0 ${Math.round(3.8 * scale)}px var(--key)`;
            let textColor  = 'var(--key)';

            if (isSealed) {
              bg        = 'rgba(246,240,250,.04)';
              boxShadow = `inset 0 0 0 ${Math.round(3.8 * scale)}px rgba(246,240,250,.28)`;
              textColor = 'rgba(246,240,250,.55)';
            } else if (isBest) {
              bg        = 'var(--pink)';
              boxShadow = 'none';
              textColor = 'var(--ink)';
            }

            return (
              <div key={key} style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: Math.round(2.5 * scale),
                padding: `${Math.round(10 * scale)}px 0 ${Math.round(12.5 * scale)}px`,
                borderRadius: Math.round(15 * scale),
                background: bg,
                boxShadow,
              }}>
                <span style={{
                  fontFamily: "'Instrument Sans', sans-serif",
                  fontSize: statLabel,
                  fontWeight: 700,
                  letterSpacing: '.12em',
                  color: textColor,
                  opacity: .85,
                }}>
                  {label}
                </span>
                <span style={{
                  fontFamily: "'Rubik', sans-serif",
                  fontSize: statNum,
                  fontWeight: 700,
                  lineHeight: 1.1,
                  fontVariantNumeric: 'tabular-nums lining-nums',
                  color: textColor,
                }}>
                  {showStats && val != null ? val : '?'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stamp overlay (grey state) */}
      {state === 'grey' && stamp && (
        <div style={{
          position: 'absolute',
          top: '44%', left: '50%',
          transform: 'translate(-50%, -50%) rotate(-12deg)',
          padding: `${stampPad[0]}px ${stampPad[1]}px`,
          borderRadius: stampRadius,
          boxShadow: `inset 0 0 0 ${stampBorder}px var(--key)`,
          background: 'rgba(27,16,38,.78)',
          fontFamily: "'Bagel Fat One', 'Arial Black', system-ui, sans-serif",
          fontSize: stampFont,
          color: 'var(--key)',
          whiteSpace: 'nowrap',
          letterSpacing: '.02em',
          pointerEvents: 'none',
        }}>
          {STAMP_TEXT[stamp] || stamp}
        </div>
      )}

      {/* Checking overlay pill (dimmed state) */}
      {state === 'dimmed' && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--ink)',
          borderRadius: 999,
          padding: `${Math.round(12 * scale)}px ${Math.round(22 * scale)}px ${Math.round(12 * scale)}px ${Math.round(14 * scale)}px`,
          boxShadow: `0 0 0 ${Math.round(3 * scale)}px var(--key), 0 ${Math.round(20*scale)}px ${Math.round(40*scale)}px -${Math.round(12*scale)}px rgba(0,0,0,.6)`,
          color: 'var(--key)',
          fontSize: Math.round(20 * scale),
          fontFamily: "'Instrument Sans', sans-serif",
          fontWeight: 700,
          display: 'flex', alignItems: 'center',
          gap: Math.round(10 * scale),
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}>
          <span style={{
            width:  Math.round(34 * scale),
            height: Math.round(34 * scale),
            flexShrink: 0,
            display: 'inline-block',
          }}>
            <svg width="100%" height="100%" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="19" fill="none"
                stroke="rgba(246,240,250,.2)" strokeWidth="5.6"/>
              <circle cx="24" cy="24" r="19" fill="none"
                stroke="var(--pink)" strokeDasharray="40 120"
                strokeLinecap="round" strokeWidth="5.6"
                transform="rotate(-60 24 24)"
                style={{ animation: 'card-arc-spin 1.4s linear infinite' }}/>
            </svg>
          </span>
          Checking…
        </div>
      )}

      <style>{`
        @keyframes card-arc-spin {
          to { stroke-dashoffset: -160; }
        }
      `}</style>
    </div>
  );
}
