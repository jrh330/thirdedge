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
  const [scale, setScale]   = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [ready, setReady]   = useState(false);
  const [exporting, setExporting] = useState(false);

  const drag = useRef({ active: false, startX: 0, startY: 0, startOx: 0, startOy: 0 });
  const pinch = useRef({ active: false, dist: 0 });

  // Canvas size — 375 on desktop, full-width on phone (clamped to window)
  const BOX = Math.min(375, typeof window !== 'undefined' ? window.innerWidth - 32 : 375);

  // Load image
  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      // Initial scale: fit the shorter dimension to BOX
      const fitScale = BOX / Math.min(img.naturalWidth, img.naturalHeight);
      setScale(fitScale);
      setOffset({ x: 0, y: 0 });
      setReady(true);
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
    const size = BOX;
    canvas.width  = size;
    canvas.height = size;

    ctx.clearRect(0, 0, size, size);

    const drawW = img.naturalWidth  * scale;
    const drawH = img.naturalHeight * scale;
    // Centre + offset
    const x = (size - drawW) / 2 + offset.x;
    const y = (size - drawH) / 2 + offset.y;

    ctx.drawImage(img, x, y, drawW, drawH);
  }, [scale, offset, ready, BOX]);

  const clampOffset = useCallback((ox, oy, sc) => {
    const img = imgRef.current;
    if (!img) return { x: ox, y: oy };
    const drawW = img.naturalWidth  * sc;
    const drawH = img.naturalHeight * sc;
    const size  = BOX;
    const maxX  = Math.max(0, (drawW - size) / 2);
    const maxY  = Math.max(0, (drawH - size) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, ox)),
      y: Math.max(-maxY, Math.min(maxY, oy)),
    };
  }, [BOX]);

  // Mouse / touch events
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

  const handleWheel = e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(s => {
      const next = Math.max(0.3, Math.min(8, s * delta));
      setOffset(prev => clampOffset(prev.x, prev.y, next));
      return next;
    });
  };

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
        const next = Math.max(0.3, Math.min(8, s * ratio));
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
    drag.current.active = false;
    pinch.current.active = false;
  };

  // Keyboard pan / zoom
  useEffect(() => {
    const handler = e => {
      const STEP = 10;
      if (e.key === 'ArrowLeft')  setOffset(prev => clampOffset(prev.x - STEP, prev.y, scale));
      if (e.key === 'ArrowRight') setOffset(prev => clampOffset(prev.x + STEP, prev.y, scale));
      if (e.key === 'ArrowUp')    setOffset(prev => clampOffset(prev.x, prev.y - STEP, scale));
      if (e.key === 'ArrowDown')  setOffset(prev => clampOffset(prev.x, prev.y + STEP, scale));
      if (e.key === '+' || e.key === '=') setScale(s => {
        const next = Math.min(8, s * 1.1);
        setOffset(prev => clampOffset(prev.x, prev.y, next));
        return next;
      });
      if (e.key === '-') setScale(s => {
        const next = Math.max(0.3, s / 1.1);
        setOffset(prev => clampOffset(prev.x, prev.y, next));
        return next;
      });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [scale, clampOffset]);

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || exporting) return;
    setExporting(true);
    canvas.toBlob(blob => {
      setExporting(false);
      if (blob) onConfirm(blob);
    }, 'image/jpeg', 0.92);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      flexDirection: 'column',
      gap: 20,
    }}>
      <h2 style={{ fontSize: 22, fontWeight: 700 }}>Crop your picture</h2>
      <p style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center' }}>
        Drag to pan · Scroll or pinch to zoom · Arrow keys to nudge · +/− to zoom
      </p>

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
