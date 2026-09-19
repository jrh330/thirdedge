import { useState, useEffect, useCallback, useRef } from 'react';
import { pollGame, gameAction } from '../lib/api.js';
import { cardFamily } from '../lib/gameUtils.js';
import GameHud from '../components/GameHud.jsx';
import GameCardTile from '../components/GameCardTile.jsx';
import Card from '../components/Card.jsx';
import { useGameToast } from '../components/GameToast.jsx';

// ── Small helpers defined at module level ─────────────────────────────────────

function FamilyWheelSVG() {
  return (
    <svg width="176" height="150" viewBox="0 0 176 150"
      aria-label="Vita blocks Arte, Arte blocks Terra, Terra blocks Vita">
      <defs>
        <marker id="ah" viewBox="0 0 10 10" refX="6" refY="5"
          markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#B7AAC6" />
        </marker>
      </defs>
      <line x1="102" y1="42"  x2="134" y2="96"  stroke="#B7AAC6" strokeWidth="2.5" strokeLinecap="round" markerEnd="url(#ah)" />
      <line x1="124" y1="122" x2="56"  y2="122" stroke="#B7AAC6" strokeWidth="2.5" strokeLinecap="round" markerEnd="url(#ah)" />
      <line x1="40"  y1="98"  x2="72"  y2="44"  stroke="#B7AAC6" strokeWidth="2.5" strokeLinecap="round" markerEnd="url(#ah)" />
      <circle cx="88"  cy="26"  r="22" fill="#FF5A1F" />
      <circle cx="146" cy="122" r="22" fill="#7B4DFF" />
      <circle cx="30"  cy="122" r="22" fill="#FFD23F" />
      <g transform="translate(78 16) scale(1.25)">
        <path d="M3 13 C3 6 7 3 13 3 C13 10 9 13 3 13 Z" fill="none" stroke="#1B1026" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M3 13 L9 7" fill="none" stroke="#1B1026" strokeWidth="1.8" strokeLinecap="round" />
      </g>
      <g transform="translate(136 112) scale(1.25)">
        <polygon points="8,1.8 13.6,5 13.6,11 8,14.2 2.4,11 2.4,5" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="8" cy="8" r="2.3" fill="none" stroke="#FFFFFF" strokeWidth="1.8" />
      </g>
      <g transform="translate(20 112) scale(1.25)">
        <path d="M1.6 13 L5.6 5.2 L8.4 9.6 L10.4 6.4 L14.4 13 Z" fill="none" stroke="#1B1026" strokeWidth="1.7" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

function StakeCoin({ n }) {
  return (
    <div className="g-stake-coin">
      <span className="g-sc-n">{n}</span>
    </div>
  );
}

function BondChip({ family, confirmed }) {
  if (!family) return null;
  const fam = family.toLowerCase();
  const cls = [
    'g-bond-chip',
    `g-bond-${fam}`,
    confirmed ? 'g-bond-confirmed' : 'g-bond-unconfirmed',
  ].join(' ');
  return (
    <span className={cls}>
      <span>⬡</span> BOND +1
    </span>
  );
}

function CardSlot({ owner, label }) {
  const cls = 'g-card-slot ' + (owner === 'opp' ? 'g-slot-opp' : 'g-slot-you');
  return (
    <div className={cls}>
      <span className="g-slot-label">{label || (owner === 'opp' ? 'Opponent' : 'Your play')}</span>
    </div>
  );
}

function LockedInBack() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Card state="back" size="sm" owner="opp" />
      <div className="g-locked-label">Locked in</div>
    </div>
  );
}

function OppFan({ count }) {
  return (
    <div className="g-opp-fan">
      <div className="g-opp-peek">
        {Array.from({ length: count ?? 0 }).map((_, i) => (
          <div key={i} className="g-peek-card" />
        ))}
      </div>
    </div>
  );
}

// ── Category icons ────────────────────────────────────────────────────────────

const CAT_ICONS = {
  power: (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
      <path d="M8 2 L10.5 6.5 L15.5 7.3 L11.75 10.95 L12.65 16 L8 13.35 L3.35 16 L4.25 10.95 L0.5 7.3 L5.5 6.5 Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  speed: (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
      <path d="M2 8 L7 3.5 L6 8 L9 8 L7 12.5 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M11 2 L14 8 L11 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  wits: (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 10 L6 14 L8 12.5 L10 14 L9.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

// ── Main Game component ───────────────────────────────────────────────────────

export default function Game({ code, myPlayerId, myRole, p1, p2, onNewGame, onBackToCards }) {
  const [ms, setMs]         = useState(null);
  const [status, setStatus] = useState('loading');
  const [loading, setLoading] = useState(false);

  const [selCard, setSelCard]         = useState(null);
  const [selCat, setSelCat]           = useState(null);
  const [selGiveCard, setSelGiveCard] = useState(null);
  const [playedCard, setPlayedCard]   = useState(null);

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
    setPlayedCard(null);
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
  const myName    = myPlayerId === p1.id ? p1.name : p2.name;

  // Rounds won
  const myWins   = ms.roundsWon?.[myPlayerId] ?? 0;
  const theirWins = ms.roundsWon?.[theirPId]  ?? 0;

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
    const trade    = ms.pendingTrade;
    const winId    = trade.winner;
    const winName  = winId === p1.id ? p1.name : p2.name;
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

  // ── Phase flags ───────────────────────────────────────────────────────────
  const isOpening    = phase === 'opening';
  const isReveal     = phase === 'reveal';
  const mySubmitted  = mySlot?.submitted;

  // ── submitMove ────────────────────────────────────────────────────────────
  async function submitMove() {
    if (!selCard) { showToast('Pick a card', true); return; }
    if (!isOpening && !selCat) { showToast('Choose a category', true); return; }
    setPlayedCard(selCard);
    await act('submitMove', { cardId: selCard, category: isOpening ? null : selCat });
    setSelCard(null);
    setSelCat(null);
  }

  // ── Note line text ────────────────────────────────────────────────────────
  let noteLine = '';
  if (isReveal) {
    noteLine = 'Check the result, then continue.';
  } else if (mySubmitted) {
    noteLine = 'Waiting for opponent\u2026';
  } else if (isOpening) {
    noteLine = selCard
      ? 'Ready to lock in.'
      : 'Opening \u2014 play a card to set your anchor.';
  } else {
    // commit phase
    if (!selCard) {
      noteLine = 'Choose a card from your hand.';
    } else if (!selCat) {
      noteLine = 'Now choose a category.';
    } else {
      noteLine = 'Ready to flip!';
    }
  }

  // ── Category totals ───────────────────────────────────────────────────────
  // Anchor card stats + (selected or played card) stats + bond bonus
  const anchorCard   = mySlot?.anchor   ? cards[mySlot.anchor]   : null;
  const activeCardId = playedCard || selCard;
  const activeCard   = activeCardId ? cards[activeCardId] : null;

  function catTotal(cat) {
    if (!anchorCard) return '\u2014';
    const anchorVal = anchorCard[cat] ?? 0;
    const playVal   = activeCard ? (activeCard[cat] ?? 0) : 0;
    const anchorFam = cardFamily(anchorCard);
    const activeFam = activeCard ? cardFamily(activeCard) : null;
    const bond      = (anchorFam && activeFam && anchorFam === activeFam) ? 1 : 0;
    return anchorVal + playVal + bond;
  }

  // ── Action button label / state ───────────────────────────────────────────
  let actLabel    = 'Flip!';
  let actDisabled = true;
  let actIsNext   = false;

  if (isReveal) {
    actLabel    = 'Next turn \u2192';
    actDisabled = loading;
    actIsNext   = true;
  } else if (mySubmitted) {
    actLabel    = 'Waiting\u2026';
    actDisabled = true;
  } else if (isOpening) {
    actLabel    = 'Lock in';
    actDisabled = !selCard || loading;
  } else {
    actLabel    = 'Flip!';
    actDisabled = !selCard || !selCat || loading;
  }

  // ── Reveal phase card lookups ─────────────────────────────────────────────
  const myLastPlayed    = isReveal ? r.lastPlayed?.[myPlayerId]  : null;
  const theirLastPlayed = isReveal ? r.lastPlayed?.[theirPId]    : null;

  // ── Determine what's shown in anchor slot and played slot ───────────────
  // Opening: selCard (or playedCard while waiting for API) previews in the
  // anchor slot; the played slot is hidden entirely.
  // Commit:  anchor shows mySlot.anchor; played slot shows selCard/playedCard.
  // Reveal:  anchor shows mySlot.anchor; played slot shows lastPlayed.
  const anchorPreviewId  = isOpening ? (selCard || playedCard) : null;
  const anchorDisplayId  = mySlot?.anchor || anchorPreviewId || null;

  const myPlaySlotCardId = isReveal
    ? myLastPlayed
    : isOpening
    ? null
    : (playedCard || selCard || null);

  // ── Determine what's shown in the "opp played" slot ──────────────────────
  const oppPlaySlotContent = isReveal
    ? (theirLastPlayed ? 'revealed' : 'empty')
    : (theirSlot?.submitted ? 'locked' : 'empty');

  // ── Pip rows ──────────────────────────────────────────────────────────────
  const roundsToWin = ms.roundsToWin ?? 2;

  function PipRow({ wins, total, variant }) {
    return (
      <div className="g-pip-row">
        {Array.from({ length: total }).map((_, i) => {
          const filled = i < wins;
          return (
            <div
              key={i}
              className={`g-pip ${filled ? 'filled' : ''} ${variant}`}
            />
          );
        })}
      </div>
    );
  }

  // ── 3-column table layout ─────────────────────────────────────────────────
  return (
    <div className="game-root">
      {ToastEl}

      {/* Mobile brand (hidden on desktop) */}
      <div id="g-mobile-brand">
        <img src="/mint/logo/svg/allagaroo-wordmark-small.svg" alt="Allagaroo" />
      </div>

      <div id="g-table">

        {/* ── LEFT RAIL ── */}
        <aside id="g-left-rail">
          <img className="g-brand" src="/mint/logo/svg/allagaroo-wordmark.svg" alt="Allagaroo" />

          {/* Opponent identity */}
          <div className="g-identity">
            <div className="g-id-label g-opp-label">Opponent</div>
            <div className="g-id-name">{theirName}</div>
            <PipRow wins={theirWins} total={roundsToWin} variant="g-opp-pip" />
          </div>

          {/* Family wheel */}
          <div className="g-wheel-wrap">
            <FamilyWheelSVG />
            <div className="g-bond-reminder">
              <b>Bond +1</b> when your played card matches your anchor&rsquo;s family &mdash; unless the opponent&rsquo;s card blocks it.
            </div>
          </div>

          {/* Your identity */}
          <div className="g-identity">
            <PipRow wins={myWins} total={roundsToWin} variant="g-you-pip" />
            <div className="g-id-name">{myName}</div>
            <div className="g-id-label g-you-label">Your deck</div>
          </div>
        </aside>

        {/* ── CENTRE ── */}
        <main id="g-centre">
          {/* Opponent fan */}
          <OppFan count={theirSlot?.handCount ?? 0} />

          {/* Opponent row */}
          <div className="g-table-row g-opp-row">
            {/* Opp anchor */}
            {theirSlot?.anchor
              ? <Card
                  card={cards[theirSlot.anchor]}
                  state="revealed"
                  size="sm"
                  owner="opp"
                  imageSrc={cards[theirSlot.anchor]?.imageUrl || null}
                />
              : <CardSlot owner="opp" label="Anchor" />
            }

            {/* Opp played / locked-in (hidden during opening) */}
            {!isOpening && (oppPlaySlotContent === 'revealed' && theirLastPlayed
              ? <Card
                  card={cards[theirLastPlayed]}
                  state="revealed"
                  size="sm"
                  owner="opp"
                  imageSrc={cards[theirLastPlayed]?.imageUrl || null}
                />
              : oppPlaySlotContent === 'locked'
              ? <LockedInBack />
              : <CardSlot owner="opp" label="Their play" />
            )}
          </div>

          {/* Pot band */}
          <div className="g-pot-band">
            <StakeCoin n={r.stake ?? 1} />
            <div>
              <div className="g-pot-label">In the pot</div>
              <div className="g-pot-pts">
                This turn is worth {r.stake ?? 1} point{(r.stake ?? 1) > 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {/* Your row */}
          <div className="g-table-row g-you-row">
            {/* Your anchor — selCard previews here during opening */}
            {anchorDisplayId
              ? <div style={{
                  display: 'inline-block',
                  borderRadius: 14,
                  outline: (selCard === anchorDisplayId && !mySubmitted)
                    ? '3px solid var(--pink)'
                    : '3px solid transparent',
                  outlineOffset: 3,
                }}>
                  <Card
                    card={cards[anchorDisplayId]}
                    state="revealed"
                    size="sm"
                    owner="you"
                    imageSrc={cards[anchorDisplayId]?.imageUrl || null}
                  />
                </div>
              : <CardSlot owner="you" label="Anchor" />
            }

            {/* Bond chip — only during commit/reveal when both anchor and play card are known */}
            {!isOpening && mySlot?.anchor && activeCard && cardFamily(anchorCard) && cardFamily(anchorCard) === cardFamily(activeCard) && (
              <BondChip
                family={cardFamily(anchorCard)}
                confirmed={isReveal || !!playedCard}
              />
            )}

            {/* Your played card / selection (hidden during opening) */}
            {!isOpening && (myPlaySlotCardId
              ? <div style={{
                  display: 'inline-block',
                  borderRadius: 14,
                  outline: (selCard === myPlaySlotCardId && !playedCard && !isReveal)
                    ? '3px solid var(--pink)'
                    : '3px solid transparent',
                  outlineOffset: 3,
                }}>
                  <Card
                    card={cards[myPlaySlotCardId]}
                    state="revealed"
                    size="sm"
                    owner="you"
                    imageSrc={cards[myPlaySlotCardId]?.imageUrl || null}
                  />
                </div>
              : <CardSlot owner="you" label="Your play" />
            )}
          </div>

          {/* Your hand fan */}
          <div className="g-your-fan">
            {isReveal
              ? (mySlot?.hand ?? []).map(cid => (
                  <GameCardTile
                    key={cid}
                    cardId={cid}
                    cards={cards}
                    selected={false}
                    disabled
                  />
                ))
              : mySubmitted
              ? null
              : (mySlot?.hand ?? []).map(cid => (
                  <GameCardTile
                    key={cid}
                    cardId={cid}
                    cards={cards}
                    selected={selCard === cid}
                    onClick={() => setSelCard(cid === selCard ? null : cid)}
                  />
                ))
            }
          </div>
        </main>

        {/* ── RIGHT RAIL ── */}
        <aside id="g-right-rail">
          {/* Round label + scores */}
          <div className="g-round-info">
            <div className="g-round-label">Round {(r.index ?? 0) + 1}</div>
            <div className="g-rounds-won">
              {myWins} <span>\u2013</span> {theirWins}
            </div>
          </div>

          {/* Category pills */}
          {isReveal
            ? (
              /* On reveal, show a simplified result summary in place of pills */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {r.lastResult && (
                  <>
                    {['power', 'speed', 'wits'].map(cat => {
                      const mySide   = r.lastResult?.[r.players[0].playerId === myPlayerId ? 'a' : 'b'];
                      const total    = mySide?.totals?.[cat];
                      const myBetter = mySide?.category === cat;
                      return (
                        <div key={cat} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 10px',
                          borderRadius: 8,
                          background: (r.lastCategories?.[myPlayerId] === cat)
                            ? 'rgba(255,46,147,.15)'
                            : 'rgba(246,240,250,.04)',
                          border: '1px solid var(--line)',
                        }}>
                          <span style={{ flex: 1, textTransform: 'capitalize', fontSize: '.85rem', fontWeight: 600, color: 'var(--muted)' }}>{cat}</span>
                          <span style={{ fontFamily: 'Rubik, sans-serif', fontSize: '1.1rem', fontWeight: 700 }}>
                            {total ?? '\u2014'}
                          </span>
                        </div>
                      );
                    })}
                    <div style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: 'rgba(246,240,250,.04)',
                      border: '1px solid var(--line)',
                      fontSize: '.75rem',
                      color: 'var(--muted)',
                      textAlign: 'center',
                    }}>
                      {r.lastResult.winner
                        ? (() => {
                            const wPid = r.players[r.lastResult.winner === 'a' ? 0 : 1].playerId;
                            const wName = wPid === p1.id ? p1.name : p2.name;
                            return `${wName} wins +${r.lastResult.stakeAwarded ?? 1} pts`;
                          })()
                        : `Tie \u2014 stake grows to ${r.lastResult.newStake ?? 2}`
                      }
                    </div>
                  </>
                )}
              </div>
            )
            : (
              <div className="g-cat-pills">
                {['power', 'speed', 'wits'].map(cat => {
                  const chosen = selCat === cat;
                  const disabled = isOpening || mySubmitted || isReveal;
                  const total = catTotal(cat);
                  return (
                    <button
                      key={cat}
                      className={'g-cat-pill' + (chosen ? ' g-cat-chosen' : '')}
                      disabled={disabled}
                      onClick={() => !disabled && setSelCat(cat === selCat ? null : cat)}
                    >
                      <div className="g-cat-icon">{CAT_ICONS[cat]}</div>
                      <span className="g-cat-name" style={{ textTransform: 'capitalize' }}>{cat}</span>
                      <span className="g-cat-total">{total}</span>
                    </button>
                  );
                })}
              </div>
            )
          }

          {/* Note line */}
          <div className="g-note-line">{noteLine}</div>

          {/* Action button */}
          <button
            id="g-act-btn"
            className={actIsNext ? 'g-act-next' : ''}
            disabled={actDisabled}
            onClick={() => {
              if (isReveal) act('advanceTurn');
              else submitMove();
            }}
          >
            {actLabel}
          </button>

          {/* Deck widget */}
          <div className="g-deck-widget">
            <div className="g-deck-stack">
              <div /><div /><div />
            </div>
            <div className="g-deck-counts">
              <div className="g-dc-row">Hand <b>{mySlot?.handCount ?? mySlot?.hand?.length ?? '\u2014'}</b></div>
              <div className="g-dc-row">Draw pile <b>{mySlot?.drawCount ?? '\u2014'}</b></div>
              <div className="g-dc-row">Round pts <b>{mySlot?.points ?? 0}</b></div>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile action bar fallback (hidden on desktop via CSS) */}
      <div className="g-mobile-action-bar">
        {isReveal
          ? (
            <button
              className="g-btn g-btn-primary"
              disabled={loading}
              onClick={() => act('advanceTurn')}
            >
              Next Turn →
            </button>
          )
          : (
            <button
              className="g-btn g-btn-primary"
              disabled={actDisabled}
              onClick={submitMove}
            >
              {isOpening ? 'Lock in' : 'Flip!'}
            </button>
          )
        }
      </div>
    </div>
  );
}
