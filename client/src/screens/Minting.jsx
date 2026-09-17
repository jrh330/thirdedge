import Card from '../components/Card.jsx';

/**
 * Minting screen — shown while mintCard is in flight.
 * Props:
 *   checkResult — { submissionId, checkPayload, ... }
 *
 * The card is in 'back' state. When mintCard resolves, App transitions to 'reveal'.
 * TODO: trigger flip animation here before transitioning to reveal.
 */
export default function Minting({ checkResult }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 24,
      padding: 24,
    }}>
      {/* TODO: trigger flip animation here before transitioning */}
      <Card
        card={null}
        state="back"
        size="lg"
        owner="you"
      />

      <p style={{
        color: 'var(--muted)',
        fontSize: 17,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: '2.5px solid var(--pink)',
          borderTopColor: 'transparent',
          display: 'inline-block',
          animation: 'minting-spin 0.8s linear infinite',
        }} />
        Minting…
      </p>

      <style>{`
        @keyframes minting-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
