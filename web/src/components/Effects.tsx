import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { cn } from '../lib/utils.ts';
import { motionTransitions } from '../lib/motion-tokens.ts';
import { useStore } from '../state/store.ts';

/** F: a small confetti burst (physics after easyUI's Rocket Party Popper) when an answer lands. */
export function Confetti() {
  const celebrate = useStore((s) => s.celebrate);
  const reduce = useReducedMotion();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!celebrate || reduce) return;
    const cv = ref.current; if (!cv) return;
    let raf = 0;
    const go = setTimeout(() => {
    const el = document.querySelector(`[data-card="${celebrate.cardId}"]`) as HTMLElement | null;
    const r = el?.getBoundingClientRect();
    const ox = r ? r.left + r.width / 2 : window.innerWidth / 2, oy = r ? r.top + 30 : window.innerHeight / 3;
    const dpr = window.devicePixelRatio || 1;
    cv.width = window.innerWidth * dpr; cv.height = window.innerHeight * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const colors = ['#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#0a0a0a'];
    const ps = Array.from({ length: 90 }, () => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9, v = 6 + Math.random() * 8;
      return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[Math.floor(Math.random() * colors.length)], life: 0 };
    });
    const step = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      let alive = 0;
      for (const p of ps) {
        p.life++; p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        const o = Math.max(0, 1 - p.life / 110);
        if (o <= 0) continue;
        alive++;
        ctx.save(); ctx.globalAlpha = o; ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      }
      if (alive) raf = requestAnimationFrame(step); else ctx.clearRect(0, 0, cv.width, cv.height);
    };
    raf = requestAnimationFrame(step);
    }, 350); // wait until the card has landed in Done
    return () => { clearTimeout(go); cancelAnimationFrame(raf); };
  }, [celebrate, reduce]);
  return <canvas ref={ref} className="fixed inset-0 w-full h-full pointer-events-none z-[80]" />;
}

/** Notification stack: toasts slide in from the bottom right and stack. */
export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="fixed bottom-5 right-5 z-[90] flex flex-col gap-2 items-end pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div key={t.id} layout initial={{ opacity: 0, y: 24, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }} transition={motionTransitions.springResponsive}
            className={cn('pointer-events-auto px-4 py-2.5 rounded-[14px] shadow-pop border text-[12.5px] max-w-[360px]',
              t.tone === 'bad' ? 'bg-bad-bg border-bad-line text-bad' : t.tone === 'ok' ? 'bg-ok-bg border-ok-line text-ok-ink' : t.tone === 'warn' ? 'bg-warn-bg border-warn-line text-warn-ink' : 'bg-white border-line')}>
            {t.title}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
