import { useState, useEffect, useCallback, useRef } from 'react';
import { pollGame, gameAction } from '../lib/api.js';
import { cardFamily } from '../lib/gameUtils.js';
import GameHud from '../components/GameHud.jsx';
import RevealResult from '../components/RevealResult.jsx';
import AnchorArea from '../components/AnchorArea.jsx';
import GameCardTile from '../components/GameCardTile.jsx';
import { useGameToast } from '../components/GameToast.jsx';

export default function Game({ code, myPlayerId, myRole, p1, p2, onNewGame, onBackToCards }) {
  const [ms, setMs]         = useState(null);
  const [status, setStatus] = useState('loading');
  const [loading, setLoading] = useState(false);

  const [selCard, setSelCard]         = useState(null);
  const [selCat, setSelCat]           = useState(null);
  const [selGiveCard, setSelGiveCard] = useState(null);

  const [ToastEl, showToast] = useGameToast();
  const pollRef = useRef(null);

  // ── Poll ──────────────────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const data = await pollGame(code);
      setStatus(data.status);
      if (data.matchState) setMs(data.matchState);
    } catch {
      // ignore poll errors
    }
  }, [code]);

  useEffect(() => {
    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => clearInterval(pollRef.current);
  }, [poll]);

  // Reset selection when phase/round changes
  useEffect(() => {
    setSelCard(null);
    setSelCat(null);
    setSelGiveCard(null);
  }, [ms?.round?.phase, ms?.round?.index]);

  // ── Action helper ─────────────────────────────────────────────────────────
  async function act(action, extra = {}) {
    setLoading(true);
    try {
      await gameAction({ code, playerId: myPlayerId, action, ...extra });
      await poll();
    } catch (e) {
      showToast(e.message || 'Action failed', true);
    } finally {
      setLoading(false);
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!ms) {
    return (
      <div className="game-root">
        <div className="g-screen">
          <div className="g-spinner" />
        </div>
      </div>
    );
  }

  const r     = ms.round;
  const cards = ms.cards;
  const phase = r.phase;

  // Find player slots
  const mySlot    = r.players.find(p => p.playerId === myPlayerId);
  const theirSlot = r.players.find(p => p.playerId !== myPlayerId);
  const theirPId  = theirSlot?.playerId;
  const theirName = theirPId === p1.id ? p1.name : p2.name;

  // ── Match over ────────────────────────────────────────────────────────────
  if (ms.winnerId) {
    const winName = ms.winnerId === p1.id ? p1.name : p2.name;
    return (
      <div className="game-root">
        <div className="g-screen">
          {ToastEl}
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
            <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 4 }}>{winName} wins!</div>
            <div style={{ color: 'var(--g-muted)', fontSize: 14, marginBottom: 28 }}>
              {ms.roundsWon[p1.id]}-{ms.roundsWon[p2.id]} in rounds
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="g-btn g-btn-primary g-btn-lg" onClick={onNewGame}>New Game</button>
              {onBackToCards && (
                <button className="g-btn g-btn-ghost" onClick={onBackToCards}>Your Cards</button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Trade phase ───────────────────────────────────────────────────────────
  if (ms.pendingTrade) {
    const trade  = ms.pendingTrade;
    const winId  = trade.winner;
    const winName = winId === p1.id ? p1.name : p2.name;
    const isWinner = myPlayerId === winId;

    if (!isWinner) {
      return (
        <div className="game-root">
          <div className="g-game-wrap g-fade">
            {ToastEl}
            <GameHud ms={ms} p1={p1} p2={p2} />
            <div className="g-surface" style={{ textAlign: 'center', padding: 32 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Trade Phase</div>
              <div style={{ color: 'var(--g-muted)', fontSize: 13 }}>
                Waiting for {winName} to decide…
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="game-root">
        <div className="g-game-wrap g-fade">
          {ToastEl}
          <GameHud ms={ms} p1={p1} p2={p2} />
          <div className="g-surface">
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Trade Phase</div>
            <div style={{ color: 'var(--g-muted)', fontSize: 12, marginBottom: 14 }}>
              You won the round! Choose to Trade, Reclaim, or Decline.
            </div>

            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, color: 'var(--g-muted)' }}>
              Your hand — pick a card to give away:
            </div>
            {mySlot?.hand.map(cid => (
              <div
                key={cid}
                className={'g-trade-card-opt' + (selGiveCard === cid ? ' selected' : '')}
                onClick={() => setSelGiveCard(cid === selGiveCard ? null : cid)}
              >
                <span style={{ fontWeight: 600 }}>{cards[cid]?.name || cid}</span>
                <span style={{ fontSize: 11, color: 'var(--g-muted)' }}>{cardFamily(cards[cid])}</span>
              </div>
            ))}

            {ms.swaps?.filter(s => s.by === winId && !s.undone).length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, color: 'var(--g-muted)' }}>
                  Reclaim a previous trade:
                </div>
                {ms.swaps.map((s, i) => s.by === winId && !s.undone ? (
                  <div
                    key={i}
                    className={'g-trade-card-opt' + (selGiveCard === 'reclaim:' + i ? ' selected' : '')}
                    onClick={() => setSelGiveCard('reclaim:' + i)}
                  >
                    <span style={{ fontSize: 12 }}>
                      Reclaim: gave {cards[s.gaveCardId]?.name}, took {cards[s.tookCardId]?.name}
                    </span>
                  </div>
                ) : null)}
              </div>
            )}
          </div>

          <div className="g-action-bar">
            {selGiveCard?.startsWith('reclaim:') ? (
              <button
                className="g-btn g-btn-gold"
                disabled={loading}
                onClick={() => {
                  const idx = parseInt(selGiveCard.split(':')[1]);
                  act('executeReclaim', { swapIndex: idx });
                }}
              >
                Reclaim Trade
              </button>
            ) : (
              <button
                className="g-btn g-btn-primary"
                disabled={!selGiveCard || loading}
                onClick={() => act('executeTrade', { giveCardId: selGiveCard })}
              >
                Execute Trade
              </button>
            )}
            <button
              className="g-btn g-btn-ghost"
              disabled={loading}
              onClick={() => act('declineTrade')}
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Reveal phase ──────────────────────────────────────────────────────────
  if (phase === 'reveal') {
    return (
      <div className="game-root">
        <div className="g-game-wrap g-fade">
          {ToastEl}
          <GameHud ms={ms} p1={p1} p2={p2} />
          <RevealResult ms={ms} p1={p1} p2={p2} cards={cards} />
          <div style={{ margin: '6px 0', display: 'flex', gap: 10 }}>
            {r.players.map(p => (
              <div key={p.playerId} className="g-surface" style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--g-muted)', marginBottom: 6 }}>
                  {p.playerId === p1.id ? p1.name : p2.name}
                </div>
                <div style={{ fontSize: 12 }}>Points: <strong>{p.points}</strong></div>
                <div style={{ fontSize: 12, color: 'var(--g-muted)' }}>
                  Hand: {p.handCount} · Draw: {p.drawCount}
                </div>
              </div>
            ))}
          </div>
          <div className="g-action-bar">
            <button
              className="g-btn g-btn-primary"
              disabled={loading}
              onClick={() => act('advanceTurn')}
            >
              Next Turn →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Opening / Commit phase ────────────────────────────────────────────────
  const isOpening = phase === 'opening';

  // Check if this player has already submitted
  const mySubmitted = mySlot?.submitted;

  async function submitMove() {
    if (!selCard) { showToast('Pick a card', true); return; }
    if (!isOpening && !selCat) { showToast('Choose a category', true); return; }
    await act('submitMove', { cardId: selCard, category: isOpening ? null : selCat });
    setSelCard(null);
    setSelCat(null);
  }

  const cats = ['power', 'speed', 'wits'];

  // If player already submitted, show waiting state
  if (mySubmitted) {
    return (
      <div className="game-root">
        <div className="g-game-wrap g-fade">
          {ToastEl}
          <GameHud ms={ms} p1={p1} p2={p2} />
          <div className="g-surface" style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Move locked in</div>
            <div style={{ color: 'var(--g-muted)', fontSize: 13, marginBottom: 16 }}>
              Waiting for opponent…
            </div>
            <div className="g-spinner" style={{ margin: '0 auto' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-root">
      <div className="g-game-wrap g-fade">
        {ToastEl}
        <GameHud ms={ms} p1={p1} p2={p2} />

        {/* Active player banner */}
        <div style={{ textAlign: 'center', padding: '6px 0' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--g-accent)' }}>
            Your turn {isOpening ? '(Opening — no category)' : ''}
          </span>
        </div>

        {/* Their anchor */}
        {!isOpening && theirSlot?.anchor && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--g-muted)', fontWeight: 600, marginBottom: 4 }}>
              {theirName}'s Anchor
            </div>
            <AnchorArea cardId={theirSlot.anchor} cards={cards} label={theirName} />
          </div>
        )}

        {/* My anchor */}
        {!isOpening && mySlot?.anchor && (
          <AnchorArea cardId={mySlot.anchor} cards={cards} label="Your Anchor" />
        )}

        {/* Hand */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--g-muted)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Your Hand ({mySlot?.hand?.length ?? 0})
          </div>
          <div className="g-hand-grid">
            {mySlot?.hand?.map(cid => (
              <GameCardTile
                key={cid}
                cardId={cid}
                cards={cards}
                selected={selCard === cid}
                onClick={() => setSelCard(cid === selCard ? null : cid)}
              />
            ))}
          </div>
        </div>

        {/* Category selector (normal turns only) */}
        {!isOpening && selCard && (
          <div className="g-surface g-fade">
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--g-muted)' }}>
              Attack category
            </div>
            <div className="cat-row">
              {cats.map(c => (
                <button
                  key={c}
                  className={'cat-btn' + (selCat === c ? ' selected' : '')}
                  onClick={() => setSelCat(c === selCat ? null : c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Discard pile */}
        {mySlot?.discard?.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--g-muted)' }}>
            Discard: {mySlot.discard.map(id => cards[id]?.name || id).join(', ')}
          </div>
        )}

        <div className="g-action-bar">
          <button
            className="g-btn g-btn-primary"
            disabled={!selCard || (!isOpening && !selCat) || loading}
            onClick={submitMove}
          >
            Lock In →
          </button>
        </div>
      </div>
    </div>
  );
}
