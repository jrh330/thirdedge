import { useState, useEffect } from 'react';

export function GameToast({ msg, err, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, []);
  return <div className={'g-toast' + (err ? ' err' : '')}>{msg}</div>;
}

export function useGameToast() {
  const [toast, setToast] = useState(null);
  function show(msg, err = false) {
    setToast({ msg, err, key: Date.now() });
  }
  const el = toast
    ? <GameToast key={toast.key} msg={toast.msg} err={toast.err} onDone={() => setToast(null)} />
    : null;
  return [el, show];
}
