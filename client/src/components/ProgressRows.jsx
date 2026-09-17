/**
 * ProgressRows — three pipeline rows showing check progress.
 * Props: step (1|2|3) — rows before step are done, step is active, after are waiting.
 */

const ROWS = [
  { label: 'Duplicate check' },
  { label: 'Content review' },
  { label: 'Scoring' },
];

const R = 12; // SVG circle radius
const CIRC = 2 * Math.PI * R;

function RowIcon({ status }) {
  if (status === 'done') {
    return (
      <svg width={28} height={28} viewBox="0 0 28 28" style={{ flexShrink: 0 }}>
        <circle cx={14} cy={14} r={12} fill="none" stroke="var(--key)" strokeWidth={2} />
        <polyline
          points="9,14 12.5,17.5 19,11"
          fill="none"
          stroke="var(--key)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (status === 'active') {
    return (
      <svg width={28} height={28} viewBox="0 0 28 28" style={{ flexShrink: 0 }}>
        <circle cx={14} cy={14} r={R} fill="none" stroke="var(--line)" strokeWidth={2.5} />
        <circle
          cx={14} cy={14} r={R}
          fill="none"
          stroke="var(--pink)"
          strokeWidth={2.5}
          strokeDasharray={`${CIRC * 0.25} ${CIRC * 0.75}`}
          strokeLinecap="round"
          style={{ transformOrigin: '14px 14px', animation: 'progress-spin 1.4s linear infinite' }}
        />
        <style>{`
          @keyframes progress-spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </svg>
    );
  }

  // waiting
  return (
    <svg width={28} height={28} viewBox="0 0 28 28" style={{ flexShrink: 0 }}>
      <circle cx={14} cy={14} r={R} fill="none" stroke="var(--line)" strokeWidth={2} />
    </svg>
  );
}

export default function ProgressRows({ step }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {ROWS.map((row, i) => {
        const rowStep = i + 1;
        const status = rowStep < step ? 'done' : rowStep === step ? 'active' : 'waiting';
        return (
          <div key={row.label} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <RowIcon status={status} />
            <span style={{
              fontSize: 16,
              color: status === 'waiting' ? 'var(--muted)' : 'var(--key)',
              fontWeight: status === 'active' ? 600 : 400,
            }}>
              {row.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
