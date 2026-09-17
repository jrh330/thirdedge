export default function CollectionFull() {
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
        Delete a card to make a new one.
      </p>
      <a
        href="/api2/collection-state"
        style={{
          color: 'var(--teal)',
          fontSize: 15,
          textDecoration: 'underline',
          marginTop: 4,
        }}
      >
        View your cards
      </a>
    </div>
  );
}
