import { useState, useEffect } from 'react';
import DeckPicker from '../components/DeckPicker.jsx';
import { useGameToast } from '../components/GameToast.jsx';
import { createGame, fetchMyDecks, getMyPlayer, updateMyName } from '../lib/api.js';

const COLLECTION_OPT = { type: 'collection' };

export default function GameCreate({ collection, onCreated, onBack }) {
  const [name, setName]              = useState('');
  const [deckOpt, setDeckOpt]       = useState(COLLECTION_OPT);
  const [customDecks, setCustomDecks] = useState([]);
  const [loading, setLoading]        = useState(false);
  const [ToastEl, showToast]         = useGameToast();

  useEffect(() => {
    getMyPlayer()
      .then(data => { if (data?.name) setName(data.name); })
      .catch(() => {});
    fetchMyDecks()
      .then(data => setCustomDecks(data.decks || []))
      .catch(() => {});
  }, []);

  async function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName) { showToast('Enter your name', true); return; }
    setLoading(true);
    try {
      await updateMyName(trimmedName);
      let body = {};
      if (deckOpt.type === 'preset')  body = { deckName: deckOpt.name };
      if (deckOpt.type === 'custom')  body = { deckId: deckOpt.id };
      const data = await createGame(body);
      if (data.error) throw new Error(data.error);
      onCreated({ code: data.code, myPlayerId: data.playerId, myRole: data.role });
    } catch (e) {
      showToast(e.message || 'Failed to create game', true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="game-root">
      {ToastEl}
      <div className="g-screen">
        <div style={{ width: '100%', maxWidth: 480 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1 }}>Create Game</div>
            <div style={{ color: 'var(--g-muted)', fontSize: 13, marginTop: 4 }}>
              Pick your deck, then share the link with your opponent
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
                autoFocus
              />
            </div>
            <DeckPicker deckOpt={deckOpt} onDeckOpt={setDeckOpt} customDecks={customDecks} />
            <button
              className="g-btn g-btn-primary g-btn-lg"
              onClick={handleCreate}
              disabled={loading}
              style={{ width: '100%', marginTop: 4 }}
            >
              {loading ? 'Creating…' : 'Create Game'}
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
