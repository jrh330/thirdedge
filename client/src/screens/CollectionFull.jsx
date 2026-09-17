import SecondaryButton from '../components/SecondaryButton.jsx';

export default function CollectionFull({ onYourCards }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      textAlign: 'center',
      flexDirection: 'column',
      gap: 16,
    }}>
      <p style={{ color: 'var(--key)', fontSize: 20, fontWeight: 600, maxWidth: 380 }}>
        Your collection is full.
      </p>
      <p style={{ color: 'var(--muted)', fontSize: 16, maxWidth: 380 }}>
        Delete a card to make room for a new one.
      </p>
      <div style={{ marginTop: 8 }}>
        <SecondaryButton onClick={onYourCards}>Your cards</SecondaryButton>
      </div>
    </div>
  );
}
