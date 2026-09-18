import { useEffect, useRef, useState, useCallback } from 'react';
import PrimaryButton from '../components/PrimaryButton.jsx';
import SecondaryButton from '../components/SecondaryButton.jsx';

/**
 * Crop screen — square crop box with pan/zoom.
 * Props:
 *   imageFile — File object
 *   onConfirm — fn(Blob) — called with JPEG blob
 *   onCancel  — fn()
 */
export default function Crop({ imageFile, onConfirm, onCancel }) {
  const canvasRef  = useRef(null);
  const imgRef     = useRef(null);
  const [scale, setScale]       = useState(1);
  const [minScale, setMinScale] = useState(0.3);
  const [offset, setOffset]     = useState({ x: 0, y: 0 });
  const [ready, setReady]       = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showGuide, setShowGuide] = useState(true);

  const drag  = useRef({ active: false, startX: 0, startY: 0, startOx: 0, startOy: 0 });
  const pinch = useRef({ active: false, dist: 0 });

  // Canvas size — 375 on desktop, full-width on phone (clamped to window)
  const BOX = Math.min(375, typeof window !== 'undefined' ? window.innerWidth - 32 : 375);

  // Badge overlay position: mirrors Card.jsx lg dimensions (picture zone = 345×345)
  const CARD_INNER = 345; // w(375) - 2*border(15)
  const badgeInset = Math.round(17.5 / CARD_INNER * BOX); // ~19px at BOX=375
  const badgeH     = Math.round(34  / CARD_INNER * BOX);  // ~37px
  const badgeW     = Math.round(130 / CARD_INNER * BOX);  // ~141px

  // Load image
  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const fitScale = BOX / Math.min(img.naturalWidth, img.naturalHeight);
      setMinScale(fitScale);
      setScale(fitScale);
      setOffset({ x: 0, y: 0 });
      setReady(true);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      onCancel();
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [imageFile, BOX]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img || !ready) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = BOX;
    canvas.height = BOX;
    ctx.clearRect(0, 0, BOX, BOX);
    const drawW = img.naturalWidth  * scale;
    const drawH = img.naturalHeight * scale;
    const x = (BOX - drawW) / 2 + offset.x;
    const y = (BOX - drawH) / 2 + offset.y;
    ctx.drawImage(img, x, y, drawW, drawH);
  }, [scale, offset, ready, BOX]);

  const clampOffset = useCallback((ox, oy, sc) => {
    const img = imgRef.current;
    if (!img) return { x: ox, y: oy };
    const drawW = img.naturalWidth  * sc;
    const drawH = img.naturalHeight * sc;
    const maxX  = Math.max(0, (drawW - BOX) / 2);
    const maxY  = Math.max(0, (drawH - BOX) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, ox)),
      y: Math.max(-maxY, Math.min(maxY, oy)),
    };
  }, [BOX]);

  // Mouse events
  const handleMouseDown = e => {
    drag.current = { active: true, startX: e.clientX, startY: e.clientY, startOx: offset.x, startOy: offset.y };
  };
  const handleMouseMove = e => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    setOffset(clampOffset(drag.current.startOx + dx, drag.current.startOy + dy, scale));
  };
  const handleMouseUp = () => { drag.current.active = false; };

  // Wheel — 5% per tick for finer control
  const handleWheel = e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.95 : 1.05;
    setScale(s => {
      const next = Math.max(minScale, Math.min(8, s * delta));
      setOffset(prev => clampOffset(prev.x, prev.y, next));
      return next;
    });
  };

  // Touch events
  const getTouchDist = touches =>
    Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

  const handleTouchStart = e => {
    if (e.touches.length === 2) {
      pinch.current = { active: true, dist: getTouchDist(e.touches) };
    } else if (e.touches.length === 1) {
      drag.current = {
        active: true,
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startOx: offset.x,
        startOy: offset.y,
      };
    }
  };

  const handleTouchMove = e => {
    e.preventDefault();
    if (e.touches.length === 2 && pinch.current.active) {
      const newDist = getTouchDist(e.touches);
      const ratio   = newDist / pinch.current.dist;
      pinch.current.dist = newDist;
      setScale(s => {
        const next = Math.max(minScale, Math.min(8, s * ratio));
        setOffset(prev => clampOffset(prev.x, prev.y, next));
        return next;
      });
    } else if (e.touches.length === 1 && drag.current.active) {
      const dx = e.touches[0].clientX - drag.current.startX;
      const dy = e.touches[0].clientY - drag.current.startY;
      setOffset(clampOffset(drag.current.startOx + dx, drag.current.startOy + dy, scale));
    }
  };

  const handleTouchEnd = () => {
    drag.current.active  = false;
    pinch.current.active = false;
  };

  // Keyboard pan / zoom — 5% zoom steps
  useEffect(() => {
    const handler = e => {
      const STEP = 8;
      if (e.key === 'ArrowLeft')  setOffset(prev => clampOffset(prev.x - STEP, prev.y, scale));
      if (e.key === 'ArrowRight') setOffset(prev => clampOffset(prev.x + STEP, prev.y, scale));
      if (e.key === 'ArrowUp')    setOffset(prev => clampOffset(prev.x, prev.y - STEP, scale));
      if (e.key === 'ArrowDown')  setOffset(prev => clampOffset(prev.x, prev.y + STEP, scale));
      if (e.key === '+' || e.key === '=') setScale(s => {
        const next = Math.min(8, s * 1.05);
        setOffset(prev => clampOffset(prev.x, prev.y, next));
        return next;
      });
      if (e.key === '-') setScale(s => {
        const next = Math.max(minScale, s / 1.05);
        setOffset(prev => clampOffset(prev.x, prev.y, next));
        return next;
      });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [scale, minScale, clampOffset]);

  // Slider zoom
  const handleSlider = e => {
    const next = parseFloat(e.target.value);
    setScale(next);
    setOffset(prev => clampOffset(prev.x, prev.y, next));
  };

  // Zoom buttons
  const zoom = delta => {
    setScale(s => {
      const next = Math.max(minScale, Math.min(8, s * delta));
      setOffset(prev => clampOffset(prev.x, prev.y, next));
      return next;
    });
  };

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || exporting) return;
    setExporting(true);
    canvas.toBlob(blob => {
      setExporting(false);
      if (blob) onConfirm(blob);
    }, 'image/jpeg', 0.92);
  };

  // Slider: map scale to 0-100 and back using log scale for natural feel
  const maxScale = Math.max(8, minScale * 10);
  const scaleToSlider = s => Math.round(
    (Math.log(s / minScale) / Math.log(maxScale / minScale)) * 100
  );
  const sliderToScale = v =>
    minScale * Math.pow(maxScale / minScale, v / 100);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      flexDirection: 'column',
      gap: 16,
    }}>
      <h2 style={{ fontSize: 22, fontWeight: 700 }}>Crop your picture</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', lineHeight: 1.5 }}>
        Drag to pan · Scroll or pinch to zoom · Arrow keys to nudge
      </p>

      {/* Canvas + overlay */}
      <div style={{ position: 'relative', userSelect: 'none' }}>
        <canvas
          ref={canvasRef}
          width={BOX}
          height={BOX}
          style={{
            display: 'block',
            borderRadius: 12,
            border: '2px solid var(--line)',
            cursor: 'grab',
            touchAction: 'none',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />

        {/* Family badge ghost — shows where the badge will sit on the card */}
        {ready && showGuide && (
          <div
            style={{
              position: 'absolute',
              top:    badgeInset,
              left:   badgeInset,
              width:  badgeW,
              height: badgeH,
              borderRadius: 999,
              border: '2px dashed rgba(246,240,250,0.75)',
              background: 'rgba(27,16,38,0.5)',
              backdropFilter: 'blur(3px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              pointerEvents: 'none',
            }}
          >
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: 'rgba(246,240,250,0.8)',
              fontFamily: "'Instrument Sans', sans-serif",
              whiteSpace: 'nowrap',
            }}>
              Family badge
            </span>
          </div>
        )}

        {!ready && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--muted)', fontSize: 15,
          }}>
            Loading…
          </div>
        )}
      </div>

      {/* Guide toggle */}
      {ready && (
        <button
          onClick={() => setShowGuide(g => !g)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            fontSize: 12,
            color: showGuide ? 'var(--muted)' : 'rgba(246,240,250,0.35)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          {showGuide ? 'Hide badge guide' : 'Show badge guide'}
        </button>
      )}

      {/* Zoom slider + buttons */}
      {ready && (
        <div style={{ width: BOX, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Zoom out */}
            <button
              onClick={() => zoom(1 / 1.15)}
              style={{
                flexShrink: 0,
                width: 34, height: 34,
                borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'var(--stock)',
                color: 'var(--key)',
                fontSize: 20,
                lineHeight: 1,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit',
              }}
              aria-label="Zoom out"
            >
              −
            </button>

            {/* Slider */}
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={scaleToSlider(scale)}
              onChange={e => {
                const next = sliderToScale(parseInt(e.target.value, 10));
                setScale(next);
                setOffset(prev => clampOffset(prev.x, prev.y, next));
              }}
              style={{
                flex: 1,
                accentColor: 'var(--pink)',
                cursor: 'pointer',
                height: 4,
              }}
            />

            {/* Zoom in */}
            <button
              onClick={() => zoom(1.15)}
              style={{
                flexShrink: 0,
                width: 34, height: 34,
                borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'var(--stock)',
                color: 'var(--key)',
                fontSize: 20,
                lineHeight: 1,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit',
              }}
              aria-label="Zoom in"
            >
              +
            </button>
          </div>

          {/* Fit button */}
          <button
            onClick={() => { setScale(minScale); setOffset({ x: 0, y: 0 }); }}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 12,
              color: 'var(--muted)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'center',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            Reset to fit
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: BOX }}>
        <PrimaryButton onClick={handleConfirm} disabled={!ready || exporting}>
          {exporting ? 'Saving…' : 'Use this crop'}
        </PrimaryButton>
        <SecondaryButton onClick={onCancel}>
          Cancel
        </SecondaryButton>
      </div>
    </div>
  );
}
