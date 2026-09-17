export default function NoSession() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      textAlign: 'center',
    }}>
      <p style={{ color: 'var(--muted)', fontSize: 18, maxWidth: 340 }}>
        You need an invite link to play Allagaroo.
      </p>
    </div>
  );
}
