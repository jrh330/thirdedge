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

// ── RevealResult — side-by-side round result panel ───────────────────────────

function RevealResult({ r, p1, p2, cards }) {
  if (!r?.lastResult) return null;
  const res = r.lastResult;

  const sideOf     = (pid) => r.players[0].playerId === pid ? 'a' : 'b';
  const winnerPid  = res.winner
    ? r.players[res.winner === 'a' ? 0 : 1].playerId
    : null;

  function PlayerCol({ pid, name }) {
    const key      = sideOf(pid);
    const side     = res[key] || {};
    const cat      = r.lastCategories?.[pid];
    const playedId = r.lastPlayed?.[pid];
    const card     = cards?.[playedId];
    const won      = winnerPid === pid;
    const tied     = !res.winner;
    const total    = cat ? (side.totals?.[cat] ?? '?') : '?';

    const resultColor = won  ? 'var(--g-green)'
                      : tied ? 'var(--g-muted)'
                      :        'var(--g-red)';
    const resultIcon  = won ? '✓' : tied ? '–' : '✗';

    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Card image */}
        {card?.imageUrl && (
          <img
            src={card.imageUrl}
            alt={card.name}
            style={{
              width: '100%', height: 72, objectFit: 'cover',
              borderRadius: 8, marginBottom: 6, display: 'block',
              border: `2.5px solid ${resultColor}`,
            }}
          />
        )}

        {/* Player name + win/loss/tie */}
        <div style={{ fontWeight: 800, fontSize: 11, marginBottom: 3, color: resultColor, letterSpacing: '.03em' }}>
          {name} {resultIcon}
        </div>

        {/* Card name */}
        <div style={{
          fontWeight: 700, fontSize: 13, marginBottom: 3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {card?.name || '—'}
        </div>

        {/* Category chosen */}
        {cat && (
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '.1em',
            textTransform: 'uppercase', color: 'var(--pink)', marginBottom: 3,
          }}>
            {cat}
          </div>
        )}

        {/* Bond / blocked modifiers */}
        {side.bonded && (
          <div style={{ fontSize: 11, color: 'var(--g-green)', marginBottom: 2 }}>
            ⬡ Bond +1
          </div>
        )}
        {side.blocked && (
          <div style={{ fontSize: 11, color: 'var(--g-red)', marginBottom: 2 }}>
            Blocked
          </div>
        )}

        {/* Total for chosen category */}
        {cat && (
          <div style={{ fontSize: 11, color: 'var(--g-muted)', marginTop: 2 }}>
            {cat.toUpperCase()} total:{' '}
            <span style={{ color: 'var(--key)', fontWeight: 700 }}>{total}</span>
          </div>
        )}

        {/* Points scored this round */}
        <div style={{
          fontSize: 16, fontWeight: 900, marginTop: 5,
          color: side.hit > 0 ? resultColor : 'var(--g-muted)',
          fontFamily: "'Rubik', sans-serif",
        }}>
          {side.hit > 0 ? `+${side.hit}` : side.hit ?? 0}
          <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 3, color: 'var(--g-muted)' }}>pts</span>
        </div>
      </div>
    );
  }

  const awardMsg = winnerPid
    ? `+${res.stakeAwarded ?? 1} pts → ${winnerPid === p1.id ? p1.name : p2.name}`
    : `Tie — stake grows to ${res.newStake ?? 2}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase',
        letterSpacing: '.1em', color: 'var(--g-muted)', marginBottom: 2 }}>
        Round Result
      </div>

      {/* Two-column player breakdown */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <PlayerCol pid={p1.id} name={p1.name} />
        <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch', flexShrink: 0 }} />
        <PlayerCol pid={p2.id} name={p2.name} />
      </div>

      {/* Award banner */}
      <div style={{
        borderTop: '1px solid var(--line)', paddingTop: 8,
        fontSize: 13, fontWeight: 800, textAlign: 'center',
        color: winnerPid ? 'var(--pink)' : 'var(--g-muted)',
      }}>
        {awardMsg}
      </div>
    </div>
  );
}

// ── Main Game component ───────────────────────────────────────────────────────

export default function Game({ code, myPlayerId, myRole, p1, p2, onNewGame, onBackToCards, onMakeCard }) {
  const [ms, setMs]         = useState(null);
  const [status, setStatus] = useState('loading');
  const [loading, setLoading] = useState(false);

  const [selCard, setSelCard]         = useState(null);
  const [selCat, setSelCat]           = useState(null);
  const [selGiveCard, setSelGiveCard] = useState(null);
  const [playedCard, setPlayedCard]   = useState(null);

  const [ToastEl, showToast] = useGameToast();
  const pollRef        = useRef(null);
  const pollFailsRef   = useRef(0);
  const POLL_NORMAL_MS = 1500;
  const POLL_BACKOFF_MS = 5000;
  const POLL_FAIL_THRESHOLD = 5; // consecutive failures before toast + backoff

  // ── Poll ──────────────────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const data = await pollGame(code);
      if (pollFailsRef.current >= POLL_FAIL_THRESHOLD) {
        // Recovered — restore normal cadence
        clearInterval(pollRef.current);
        pollRef.current = setInterval(poll, POLL_NORMAL_MS);
      }
      pollFailsRef.current = 0;
      setStatus(data.status);
      if (data.matchState) setMs(data.matchState);
    } catch {
      pollFailsRef.current += 1;
      if (pollFailsRef.current === POLL_FAIL_THRESHOLD) {
        showToast('Connection lost — retrying…', true);
        // Back off to avoid hammering a struggling server
        clearInterval(pollRef.current);
        pollRef.current = setInterval(poll, POLL_BACKOFF_MS);
      }
    }
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    pollFailsRef.current = 0;
    poll();
    pollRef.current = setInterval(poll, POLL_NORMAL_MS);
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', width: '100%', maxWidth: 320, margin: '0 auto' }}>
              {onMakeCard && (
                <button className="g-btn g-btn-primary g-btn-lg" onClick={onMakeCard} style={{ width: '100%' }}>
                  Make your own card →
                </button>
              )}
              <button className="g-btn g-btn-ghost" onClick={onNewGame} style={{ width: '100%' }}>Play again</button>
              {onBackToCards && (
                <button className="g-btn g-btn-ghost" onClick={onBackToCards} style={{ width: '100%' }}>Your cards</button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Trade phase (disabled) ───────────────────────────────────────────────
   * To re-enable: remove this comment block and restore the pendingTrade UI.
   * The engine also needs the trade block un-commented in engine2/match.js.
   *
   * if (ms.pendingTrade) { ... Trade / Reclaim / Decline UI ... }
   * ── end trade phase ─────────────────────────────────────────────────── */

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
          {/* Round label */}
          <div className="g-round-info">
            <div className="g-round-label">Round {(r.index ?? 0) + 1}</div>
          </div>

          {/* Category pills / reveal result */}
          {isReveal
            ? <RevealResult r={r} p1={p1} p2={p2} cards={cards} />
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
