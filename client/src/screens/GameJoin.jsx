import { useState, useEffect } from 'react';
import DeckPicker from '../components/DeckPicker.jsx';
import { useGameToast } from '../components/GameToast.jsx';
import { joinGame, pollGame, fetchMyDecks, getMyPlayer, updateMyName } from '../lib/api.js';

const COLLECTION_OPT = { type: 'collection' };

export default function GameJoin({ initialCode, collection, onJoined, onBack, onMakeCards }) {
  const [code, setCode]            = useState(initialCode || '');
  const [name, setName]            = useState('');
  const [deckOpt, setDeckOpt]      = useState(COLLECTION_OPT);
  const [customDecks, setCustomDecks] = useState([]);
  const [loading, setLoading]      = useState(false);
  const [ToastEl, showToast]       = useGameToast();

  useEffect(() => {
    getMyPlayer()
      .then(data => { if (data?.name) setName(data.name); })
      .catch(() => {});
    fetchMyDecks()
      .then(data => setCustomDecks(data.decks || []))
      .catch(() => {});
  }, []);

  async function handleJoin() {
    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();
    if (!trimmedCode) { showToast('Enter a game code', true); return; }
    if (!trimmedName) { showToast('Enter your name', true); return; }
    setLoading(true);
    try {
      // Save name first so it's reflected in the game
      await updateMyName(trimmedName);

      let body = { code: trimmedCode };
      if (deckOpt.type === 'preset') body.deckName = deckOpt.name;
      if (deckOpt.type === 'custom') body.deckId   = deckOpt.id;
      const data = await joinGame(body);
      if (data.error) throw new Error(data.error);

      // Fetch poll to get player names
      const pollData = await pollGame(trimmedCode);

      onJoined({
        code:       trimmedCode,
        myPlayerId: data.playerId,
        myRole:     data.role,
        p1Id:       data.p1Id   || pollData.p1?.id,
        p2Id:       data.p2Id   || pollData.p2?.id,
        p1Name:     data.p1Name ?? pollData.p1?.name,
        p2Name:     data.p2Name ?? pollData.p2?.name,
      });
    } catch (e) {
      showToast(e.message || 'Failed to join game', true);
    } finally {
      setLoading(false);
    }
  }

  // No cards yet — block with a helpful message
  const hasCards = collection && (collection.active?.length ?? 0) > 0;
  if (collection && !hasCards) {
    return (
      <div className="game-root">
        <div className="g-screen">
          <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🃏</div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.5, marginBottom: 10 }}>
              You need cards to play
            </div>
            <div style={{ color: 'var(--g-muted)', fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
              Make at least one card before joining a game.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="g-btn g-btn-primary g-btn-lg"
                onClick={onMakeCards || onBack}
                style={{ width: '100%' }}
              >
                Make a card →
              </button>
              <button className="g-btn g-btn-ghost" onClick={onBack} style={{ width: '100%' }}>
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-root">
      {ToastEl}
      <div className="g-screen">
        <div style={{ width: '100%', maxWidth: 480 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1 }}>Join Game</div>
            <div style={{ color: 'var(--g-muted)', fontSize: 13, marginTop: 4 }}>
              Enter the code from your opponent
            </div>
          </div>
          <div className="g-surface g-fade" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label>Your name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter your name"
                maxLength={40}
                autoFocus={!initialCode}
              />
            </div>
            <div>
              <label>Game Code</label>
              {initialCode ? (
                <div style={{
                  background: 'var(--g-surface2)',
                  border: '1px solid var(--g-border)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--g-text)',
                  letterSpacing: 2,
                }}>
                  {code}
                </div>
              ) : (
                <input
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="Enter code"
                  style={{ textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700 }}
                />
              )}
            </div>
            <DeckPicker deckOpt={deckOpt} onDeckOpt={setDeckOpt} customDecks={customDecks} />
            <button
              className="g-btn g-btn-primary g-btn-lg"
              onClick={handleJoin}
              disabled={loading}
              style={{ width: '100%', marginTop: 4 }}
            >
              {loading ? 'Joining…' : 'Join Game'}
            </button>
            <button className="g-btn g-btn-ghost" onClick={onBack} style={{ width: '100%' }}>
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
