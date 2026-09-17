/**
 * PrimaryButton — pink button with Ben-Day dot shadow behind the face.
 * Props: children, onClick, disabled, style (optional)
 */
export default function PrimaryButton({ children, onClick, disabled = false, style }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block', ...style }}>
      {/* Ben-Day dot shadow layer */}
      {!disabled && (
        <div aria-hidden="true" style={{
          position: 'absolute',
          inset: 0,
          top: 4,
          left: 4,
          borderRadius: 10,
          background: `
            radial-gradient(circle, var(--pink-dark) 1.26px, transparent 1.76px) 0 0 / 5px 5px,
            radial-gradient(circle, var(--pink-dark) 1.26px, transparent 1.76px) 2.5px 2.5px / 5px 5px,
            transparent
          `,
          pointerEvents: 'none',
        }} />
      )}

      {/* Button face */}
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          position: 'relative',
          display: 'block',
          background: disabled ? 'var(--stock)' : 'var(--pink)',
          color: disabled ? 'var(--muted)' : '#fff',
          border: 'none',
          borderRadius: 10,
          padding: '14px 28px',
          fontSize: 17,
          fontFamily: "'Instrument Sans', system-ui, sans-serif",
          fontWeight: 700,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.45 : 1,
          transition: 'transform 0.08s, opacity 0.15s',
          width: '100%',
        }}
        onMouseDown={e => { if (!disabled) e.currentTarget.style.transform = 'translate(2px,2px)'; }}
        onMouseUp={e => { e.currentTarget.style.transform = ''; }}
        onMouseLeave={e => { e.currentTarget.style.transform = ''; }}
      >
        {children}
      </button>
    </div>
  );
}
