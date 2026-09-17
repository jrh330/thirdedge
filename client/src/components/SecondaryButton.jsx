/**
 * SecondaryButton — ghost outlined button.
 * Props: children, onClick, disabled, style (optional)
 */
export default function SecondaryButton({ children, onClick, disabled = false, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'block',
        background: 'transparent',
        color: disabled ? 'var(--muted)' : 'var(--key)',
        border: `1.5px solid ${disabled ? 'var(--line)' : 'var(--line)'}`,
        borderColor: disabled ? 'rgba(246,240,250,.2)' : 'rgba(246,240,250,.35)',
        borderRadius: 10,
        padding: '13px 28px',
        fontSize: 17,
        fontFamily: "'Instrument Sans', system-ui, sans-serif",
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'border-color 0.15s, opacity 0.15s',
        width: '100%',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
