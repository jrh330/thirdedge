/**
 * CharCounter — shows current/max character count.
 * Props: current (number), max (number)
 */
export default function CharCounter({ current, max }) {
  const over = current > max;
  return (
    <span style={{
      font: "700 13px/1 'Rubik', sans-serif",
      color: over ? '#ff4444' : 'var(--muted)',
    }}>
      {current}/{max}
    </span>
  );
}
