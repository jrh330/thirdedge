import { useReducer, useEffect, useRef } from 'react';
import './tokens.css';
import './game.css';

import Header         from './components/Header.jsx';
import ResumeBanner   from './components/ResumeBanner.jsx';
import NoSession      from './screens/NoSession.jsx';
import CollectionFull from './screens/CollectionFull.jsx';
import Make           from './screens/Make.jsx';
import Crop           from './screens/Crop.jsx';
import Checking       from './screens/Checking.jsx';
import CheckResult    from './screens/CheckResult.jsx';
import Minting        from './screens/Minting.jsx';
import Reveal         from './screens/Reveal.jsx';
import YourCards      from './screens/YourCards.jsx';
import GameCreate     from './screens/GameCreate.jsx';
import GameWait       from './screens/GameWait.jsx';
import GameJoin       from './screens/GameJoin.jsx';
import Game           from './screens/Game.jsx';

import { getCollectionState, checkSubmission, mintCard } from './lib/api.js';
import { loadDraft, saveDraft, clearDraft } from './lib/draft.js';

// ── State machine ─────────────────────────────────────────────────────────────

const initialState = {
  screen:      'make',
  draft:       null,            // { name, flavorText, imageBlob }
  imageFile:   null,            // File awaiting crop
  croppedBlob: null,            // Blob from Crop screen
  checkResult: null,            // server response from /api2/check
  mintResult:  null,            // { card, placement }
  collection:  null,            // from /api2/collection-state
  liveMatch:   null,            // { code, status, role, p1Id, p1Name, p2Id, p2Name }
  error:       null,
  // Game state
  gameCode:    null,
  gameRole:    null,
  myPlayerId:  null,
  gameP1:      null,
  gameP2:      null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_COLLECTION':
      return { ...state, collection: action.payload, liveMatch: action.payload?.liveMatch ?? state.liveMatch };
    case 'RESTORE_DRAFT':
      return { ...state, draft: action.payload, screen: 'make' };
    case 'DRAFT_CHANGE':
      return { ...state, draft: action.payload };
    case 'IMAGE_SELECTED':
      return { ...state, imageFile: action.payload, screen: 'crop' };
    case 'CROP_CONFIRM':
      return {
        ...state,
        croppedBlob: action.payload,
        draft: state.draft
          ? { ...state.draft, imageBlob: action.payload }
          : { name: '', flavorText: '', imageBlob: action.payload },
        imageFile: null,
        screen: 'make',
      };
    case 'CROP_CANCEL':
      return { ...state, imageFile: null, screen: 'make' };
    case 'SUBMIT_DRAFT':
      return {
        ...state,
        draft: action.payload,
        croppedBlob: action.payload.imageBlob,
        checkResult: null,
        screen: 'checking',
      };
    case 'CHECK_RESULT':
      return { ...state, checkResult: action.payload, screen: 'check_result' };
    case 'CHECK_ABANDONED':
      return { ...state, screen: 'make' };
    case 'MINT':
      return { ...state, screen: 'minting' };
    case 'MINT_RESULT':
      return { ...state, mintResult: action.payload, checkResult: null, screen: 'reveal' };
    case 'YOUR_CARDS':
      return { ...state, screen: 'your_cards' };
    case 'MAKE_ANOTHER':
      return { ...initialState, collection: state.collection, screen: 'make' };
    case 'NO_SESSION':
      return { ...state, screen: 'no_session' };
    case 'COLLECTION_FULL':
      return { ...state, screen: 'collection_full' };
    case 'ERROR':
      return { ...state, error: action.payload, screen: 'error' };
    // Game actions
    case 'PLAY':
      return { ...state, screen: 'game_create' };
    case 'JOIN_VIA_URL':
      return { ...state, screen: 'game_join', gameCode: action.payload.code };
    case 'GAME_CREATED':
      return {
        ...state,
        screen: 'game_wait',
        gameCode: action.payload.code,
        myPlayerId: action.payload.myPlayerId,
        gameRole: action.payload.myRole,
      };
    case 'GAME_JOINED':
      return {
        ...state,
        screen: 'game',
        gameCode: action.payload.code,
        myPlayerId: action.payload.myPlayerId,
        gameRole: action.payload.myRole,
        gameP1: { id: action.payload.p1Id, name: action.payload.p1Name },
        gameP2: { id: action.payload.p2Id, name: action.payload.p2Name },
      };
    case 'GAME_OPPONENT_JOINED':
      return {
        ...state,
        screen: 'game',
        gameP1: { id: action.payload.p1Id, name: action.payload.p1Name },
        gameP2: { id: action.payload.p2Id, name: action.payload.p2Name },
      };
    case 'GAME_END':
      return {
        ...state,
        screen: 'game_over',
        gameCode: null,
        gameRole: null,
        myPlayerId: null,
        gameP1: null,
        gameP2: null,
        liveMatch: null,
      };
    case 'RESUME_GAME': {
      const lm = action.payload;
      if (lm.status === 'waiting') {
        return {
          ...state,
          screen:     'game_wait',
          gameCode:   lm.code,
          myPlayerId: lm.p1Id,
          gameRole:   'p1',
        };
      }
      const myId = lm.role === 'creator' ? lm.p1Id : lm.p2Id;
      return {
        ...state,
        screen:     'game',
        gameCode:   lm.code,
        myPlayerId: myId,
        gameRole:   lm.role === 'creator' ? 'p1' : 'p2',
        gameP1:     { id: lm.p1Id, name: lm.p1Name },
        gameP2:     { id: lm.p2Id, name: lm.p2Name },
      };
    }
    default:
      return state;
  }
}

// ── Header step mapping ───────────────────────────────────────────────────────

function screenToStep(screen) {
  if (screen === 'make' || screen === 'crop')             return 1;
  if (screen === 'checking' || screen === 'check_result') return 2;
  if (screen === 'minting') return 3;
  if (screen === 'reveal' || screen === 'your_cards') return 4;
  return 1;
}

// ── App ───────────────────────────────────────────────────────────────────────

// Fade out the splash overlay, enforcing a minimum visible time.
const splashShownAt = Date.now();
function dismissSplash() {
  const el = document.getElementById('splash');
  if (!el || el.classList.contains('fade-out')) return;
  const elapsed = Date.now() - splashShownAt;
  const delay = Math.max(0, 500 - elapsed);
  setTimeout(() => {
    el.classList.add('fade-out');
    el.addEventListener('transitionend', () => el.classList.add('gone'), { once: true });
  }, delay);
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Track in-flight check so we can ignore the response if user abandons
  const checkAbortRef = useRef(false);

  // Keep Railway container warm — ping every 4 minutes to prevent cold starts
  useEffect(() => {
    const ping = () => fetch('/_env').catch(() => {});
    const id = setInterval(ping, 4 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // On mount: fetch collection state + load draft + check for join code
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Support both /g/:code URL path and legacy ?code= query param
    const pathMatch = window.location.pathname.match(/^\/g\/([A-Za-z0-9]{4,8})$/i);
    const joinCode = (pathMatch ? pathMatch[1] : null) || params.get('code');

    getCollectionState()
      .then(data => {
        if (data?.status === 401 || data?.error === 'no_session') {
          dispatch({ type: 'NO_SESSION' });
          return;
        }
        dispatch({ type: 'SET_COLLECTION', payload: data });

        // Check for ?code= join param only after successful auth
        if (joinCode) {
          window.history.replaceState({}, '', window.location.pathname);
          dispatch({ type: 'JOIN_VIA_URL', payload: { code: joinCode.toUpperCase() } });
          return;
        }

        if ((data?.total ?? 0) >= 20) {
          dispatch({ type: 'COLLECTION_FULL' });
        }
      })
      .catch(() => {
        // Network error — let user continue, collection strip will be empty
      })
      .finally(() => {
        // Notify the loading screen that the app is ready.
        // The loading screen shows a Play button; the splash only dismisses
        // when the user clicks it (so audio context can be unlocked on click).
        if (window.allagarooLoading?.notifyReady) {
          window.allagarooLoading.notifyReady();
        } else {
          dismissSplash(); // fallback for environments without the loading screen
        }
      });

    loadDraft()
      .then(draft => { if (draft) dispatch({ type: 'RESTORE_DRAFT', payload: draft }); })
      .catch(() => {});
  }, []);

  // Fire check when screen becomes 'checking'
  useEffect(() => {
    if (state.screen !== 'checking') return;
    checkAbortRef.current = false;

    checkSubmission({
      name:       state.draft?.name,
      flavorText: state.draft?.flavorText,
      imageBlob:  state.croppedBlob || state.draft?.imageBlob,
    })
      .then(result => {
        if (checkAbortRef.current) return;
        dispatch({ type: 'CHECK_RESULT', payload: result });
      })
      .catch(err => {
        if (checkAbortRef.current) return;
        dispatch({ type: 'CHECK_RESULT', payload: { status: 'error', reason: err.message } });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.screen]);

  // Fire mint when screen becomes 'minting'
  useEffect(() => {
    if (state.screen !== 'minting') return;

    mintCard({ submissionId: state.checkResult?.submissionId })
      .then(result => {
        if (!result?.card) {
          dispatch({ type: 'CHECK_RESULT', payload: { status: 'error', reason: result?.error || result?.reason || 'Mint failed — try checking again.' } });
          return;
        }
        getCollectionState()
          .then(col => dispatch({ type: 'SET_COLLECTION', payload: col }))
          .catch(() => {});
        clearDraft().catch(() => {});
        dispatch({ type: 'MINT_RESULT', payload: result });
      })
      .catch(err => {
        dispatch({ type: 'CHECK_RESULT', payload: { status: 'error', reason: err.message } });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.screen]);

  const handleEdit = () => {
    checkAbortRef.current = true;
    dispatch({ type: 'CHECK_ABANDONED' });
  };

  const { screen } = state;

  // Headerless screens
  if (screen === 'no_session')      return <NoSession />;
  if (screen === 'collection_full') return <CollectionFull onYourCards={() => dispatch({ type: 'YOUR_CARDS' })} />;

  // Crop is full-screen
  if (screen === 'crop') {
    return (
      <Crop
        imageFile={state.imageFile}
        onConfirm={blob => dispatch({ type: 'CROP_CONFIRM', payload: blob })}
        onCancel={() => dispatch({ type: 'CROP_CANCEL' })}
      />
    );
  }

  // Game screens — full-screen, no minting header/layout
  if (screen === 'game_create') {
    return (
      <GameCreate
        collection={state.collection}
        onCreated={payload => dispatch({ type: 'GAME_CREATED', payload })}
        onBack={() => dispatch({ type: 'YOUR_CARDS' })}
        onMakeCards={() => dispatch({ type: 'MAKE_ANOTHER' })}
      />
    );
  }

  if (screen === 'game_wait') {
    return (
      <GameWait
        code={state.gameCode}
        onOpponentJoined={payload => dispatch({ type: 'GAME_OPPONENT_JOINED', payload })}
        onBack={() => dispatch({ type: 'YOUR_CARDS' })}
      />
    );
  }

  if (screen === 'game_join') {
    return (
      <GameJoin
        initialCode={state.gameCode}
        collection={state.collection}
        onJoined={payload => dispatch({ type: 'GAME_JOINED', payload })}
        onBack={() => dispatch({ type: 'YOUR_CARDS' })}
        onMakeCards={() => dispatch({ type: 'MAKE_ANOTHER' })}
      />
    );
  }

  if (screen === 'game') {
    return (
      <Game
        code={state.gameCode}
        myPlayerId={state.myPlayerId}
        myRole={state.gameRole}
        p1={state.gameP1}
        p2={state.gameP2}
        onNewGame={() => dispatch({ type: 'GAME_END' })}
        onBackToCards={() => dispatch({ type: 'GAME_END' })}
        onMakeCard={() => dispatch({ type: 'MAKE_ANOTHER' })}
      />
    );
  }

  if (screen === 'game_over') {
    return (
      <div className="game-root">
        <div className="g-screen">
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -0.5, marginBottom: 12 }}>
              Game over
            </div>
            <p style={{ color: 'var(--g-muted)', fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
              Make your own card and swap it in — the numbers come from your words and picture.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="g-btn g-btn-primary g-btn-lg"
                onClick={() => dispatch({ type: 'MAKE_ANOTHER' })}
                style={{ width: '100%' }}
              >
                Make a card →
              </button>
              <button
                className="g-btn g-btn-ghost"
                onClick={() => dispatch({ type: 'YOUR_CARDS' })}
                style={{ width: '100%' }}
              >
                Your cards
              </button>
              <button
                className="g-btn g-btn-ghost"
                onClick={() => dispatch({ type: 'PLAY' })}
                style={{ width: '100%' }}
              >
                Play again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const step = screenToStep(screen);
  const canGoBack = screen === 'check_result' || screen === 'checking';

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header
        step={step}
        onBack={canGoBack ? handleEdit : null}
        backLabel="Edit"
        onPlay={() => dispatch({ type: 'PLAY' })}
      />

      <ResumeBanner
        liveMatch={state.liveMatch}
        onResume={() => dispatch({ type: 'RESUME_GAME', payload: state.liveMatch })}
      />

      <main style={{ flex: 1 }}>
        {screen === 'make' && (
          <Make
            draft={state.draft}
            onDraftChange={draft => dispatch({ type: 'DRAFT_CHANGE', payload: draft })}
            onImageSelect={file => dispatch({ type: 'IMAGE_SELECTED', payload: file })}
            onSubmit={draftData => dispatch({ type: 'SUBMIT_DRAFT', payload: draftData })}
            collection={state.collection}
            checkResult={
              (state.checkResult?.status === 'declined' || state.checkResult?.status === 'error')
                ? state.checkResult
                : null
            }
          />
        )}

        {screen === 'checking' && (
          <Checking
            draft={state.draft}
            croppedBlob={state.croppedBlob}
            onEdit={handleEdit}
          />
        )}

        {screen === 'check_result' && (
          <CheckResult
            checkResult={state.checkResult}
            draft={state.draft}
            croppedBlob={state.croppedBlob}
            onMint={() => dispatch({ type: 'MINT' })}
            onEdit={handleEdit}
            onRetry={() => dispatch({ type: 'SUBMIT_DRAFT', payload: state.draft })}
            onYourCards={() => dispatch({ type: 'YOUR_CARDS' })}
            collection={state.collection}
          />
        )}

        {screen === 'minting' && (
          <Minting checkResult={state.checkResult} />
        )}

        {screen === 'reveal' && (
          <Reveal
            mintResult={state.mintResult}
            croppedBlob={state.croppedBlob}
            draft={state.draft}
            collection={state.collection}
            onMakeAnother={() => dispatch({ type: 'MAKE_ANOTHER' })}
            onYourCards={() => dispatch({ type: 'YOUR_CARDS' })}
          />
        )}

        {screen === 'your_cards' && (
          <YourCards
            collection={state.collection}
            onMakeAnother={() => dispatch({ type: 'MAKE_ANOTHER' })}
            onRefresh={() => getCollectionState().then(col => dispatch({ type: 'SET_COLLECTION', payload: col })).catch(() => {})}
            onPlay={() => dispatch({ type: 'PLAY' })}
          />
        )}

        {screen === 'error' && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
            <p>Something went wrong.</p>
            {state.error && <p style={{ fontSize: 13, marginTop: 8 }}>{state.error}</p>}
          </div>
        )}
      </main>
    </div>
  );
}
