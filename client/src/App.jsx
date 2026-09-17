import { useReducer, useEffect, useRef } from 'react';
import './tokens.css';

import Header         from './components/Header.jsx';
import NoSession      from './screens/NoSession.jsx';
import CollectionFull from './screens/CollectionFull.jsx';
import Make           from './screens/Make.jsx';
import Crop           from './screens/Crop.jsx';
import Checking       from './screens/Checking.jsx';
import CheckResult    from './screens/CheckResult.jsx';
import Minting        from './screens/Minting.jsx';
import Reveal         from './screens/Reveal.jsx';

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
  error:       null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_COLLECTION':
      return { ...state, collection: action.payload };
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
    case 'MAKE_ANOTHER':
      return { ...initialState, collection: state.collection, screen: 'make' };
    case 'NO_SESSION':
      return { ...state, screen: 'no_session' };
    case 'COLLECTION_FULL':
      return { ...state, screen: 'collection_full' };
    case 'ERROR':
      return { ...state, error: action.payload, screen: 'error' };
    default:
      return state;
  }
}

// ── Header step mapping ───────────────────────────────────────────────────────

function screenToStep(screen) {
  if (screen === 'make' || screen === 'crop')             return 1;
  if (screen === 'checking' || screen === 'check_result') return 2;
  if (screen === 'minting') return 3;
  if (screen === 'reveal')  return 4;
  return 1;
}

// ── App ───────────────────────────────────────────────────────────────────────

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

  // On mount: fetch collection state + load draft
  useEffect(() => {
    getCollectionState()
      .then(data => {
        if (data?.status === 401 || data?.error === 'no_session') {
          dispatch({ type: 'NO_SESSION' });
          return;
        }
        if ((data?.total ?? 0) >= 20) {
          dispatch({ type: 'COLLECTION_FULL' });
          return;
        }
        dispatch({ type: 'SET_COLLECTION', payload: data });
      })
      .catch(() => {
        // Network error — let user continue, collection strip will be empty
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
  if (screen === 'collection_full') return <CollectionFull />;

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

  const step = screenToStep(screen);
  const canGoBack = screen === 'check_result' || screen === 'checking';

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header
        step={step}
        onBack={canGoBack ? handleEdit : null}
        backLabel="Edit"
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
            onYourCards={() => { window.location.href = '/api2/collection-state'; }}
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
