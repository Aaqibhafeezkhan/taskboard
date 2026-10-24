import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useRef, useState } from 'react';
import type { LiveInput } from '../../../shared/types.ts';
import type { LiveConn, LiveMeta } from '../api/transport.ts';
import { cn } from '../lib/utils.ts';
import { useStore } from '../state/store.ts';

interface Props {
  cardId: string;
  fps: number;
  width: number;         // requested frame width (px)
  interactive?: boolean; // take-over: clicks/keys go to the tab
  className?: string;
  imgClassName?: string;
  onMeta?: (m: LiveMeta) => void;
  showClicks?: boolean;
  children?: React.ReactNode;
}

/**
 * Live picture of an agent's browser tab (animation L: soft cross-fade between frames, click ripple).
 * Frames arrive as JPEG blobs over ws/live; we swap object URLs and revoke the old one.
 */
export function LiveImage({ cardId, fps, width, interactive, className, imgClassName, onMeta, showClicks = true, children }: Props) {
  const transport = useStore((s) => s.transport);
  const [src, setSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<'open' | 'closed'>('closed');
  const [clicks, setClicks] = useState<{ id: number; x: number; y: number }[]>([]);
  const conn = useRef<LiveConn | null>(null);
  const prev = useRef<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const metaRef = useRef(onMeta);
  metaRef.current = onMeta;

  useEffect(() => {
    if (!transport) return;
    let visible = true;
    const c = transport.live(cardId, fps, width, {
      onFrame(b) {
        if (!visible) return;
        const url = URL.createObjectURL(b);
        setSrc(url);
        const old = prev.current;
        prev.current = url;
        if (old) setTimeout(() => URL.revokeObjectURL(old), 400);
      },
      onMeta: (m) => metaRef.current?.(m),
      onStatus: setStatus,
    });
    conn.current = c;
    // Pause frames when the tab is hidden; resume after.
    const vis = () => { visible = !document.hidden; c.send({ type: 'fps', fps: visible ? fps : 0 }); };
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      c.close();
      conn.current = null;
      if (prev.current) URL.revokeObjectURL(prev.current);
      prev.current = null;
    };
  }, [transport, cardId, width]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { conn.current?.send({ type: 'fps', fps }); }, [fps]);

  const norm = (e: React.MouseEvent | React.WheelEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const send = (i: LiveInput) => conn.current?.send(i);

  // keyboard while taking over: printable text batches, special keys separately
  useEffect(() => {
    if (!interactive) return;
    const el = box.current;
    if (!el) return;
    el.focus();
    const special = new Set(['Enter', 'Tab', 'Backspace', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Delete', 'Home', 'End', 'PageUp', 'PageDown']);
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      if (special.has(e.key)) { e.preventDefault(); send({ type: 'key', key: e.key }); }
      else if (e.key.length === 1) { e.preventDefault(); send({ type: 'text', text: e.key }); }
    };
    const onPaste = (e: ClipboardEvent) => { const t = e.clipboardData?.getData('text'); if (t) { e.preventDefault(); send({ type: 'text', text: t }); } };
    el.addEventListener('keydown', onKey);
    el.addEventListener('paste', onPaste);
    return () => { el.removeEventListener('keydown', onKey); el.removeEventListener('paste', onPaste); };
  }, [interactive]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastMove = useRef(0);
  return (
    <div
      ref={box}
      tabIndex={interactive ? 0 : -1}
      className={cn('relative overflow-hidden bg-[#fafafa] outline-none', interactive && 'cursor-crosshair ring-2 ring-ink/80', className)}
      onClick={interactive ? (e) => { const p = norm(e); send({ type: 'click', ...p }); if (showClicks) { const id = Date.now(); setClicks((c) => [...c, { id, ...p }]); setTimeout(() => setClicks((c) => c.filter((x) => x.id !== id)), 650); } } : undefined}
      onMouseMove={interactive ? (e) => { const t = Date.now(); if (t - lastMove.current > 60) { lastMove.current = t; send({ type: 'move', ...norm(e) }); } } : undefined}
      onWheel={interactive ? (e) => send({ type: 'scroll', ...norm(e), dy: e.deltaY }) : undefined}
    >
      {src ? (
        <img src={src} alt="" draggable={false} className={cn('block w-full h-full object-cover object-top select-none pointer-events-none transition-opacity duration-150', imgClassName)} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-faint text-[11px]">
          {status === 'open' ? 'waiting for the first picture…' : 'connecting…'}
        </div>
      )}
      <AnimatePresence>
        {clicks.map((c) => (
          <motion.span key={c.id} initial={{ scale: 0.4, opacity: 0.9 }} animate={{ scale: 2.2, opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }}
            className="absolute size-6 -ml-3 -mt-3 rounded-full border-[3px] border-[#ef4444] pointer-events-none" style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }} />
        ))}
      </AnimatePresence>
      {children}
    </div>
  );
}
