import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { memo, useEffect, useState } from 'react';
import { motionTransitions } from '../lib/motion-tokens.ts';
import { cn } from '../lib/utils.ts';

// Dot-matrix glyphs from easyUI's Airport Matrix Clock, used as a countdown (animation A).
const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'], '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
};
const DOTS = Array.from({ length: 35 }, (_, i) => ({ x: i % 5, y: Math.floor(i / 5) }));
const R = 0.36;
const path = (ch: string | null) => DOTS.filter(({ x, y }) => ch === null || GLYPHS[ch][y][x] === '1')
  .map(({ x, y }) => `M${x - R},${y}a${R},${R} 0 1,0 ${R * 2},0a${R},${R} 0 1,0 ${-R * 2},0`).join('');
const OFF = path(null);
const ON = Object.fromEntries(Object.keys(GLYPHS).map((c) => [c, path(c)]));

const Tile = memo(function Tile({ ch, i, reduce }: { ch: string; i: number; reduce: boolean }) {
  return (
    <span className="relative inline-flex h-[30px] w-[22px] items-center justify-center overflow-hidden rounded-[6px] bg-ink">
      <AnimatePresence initial={false}>
        <motion.svg
          key={ch}
          viewBox="-0.6 -0.6 5.2 7.2"
          className="absolute inset-0 m-auto h-[20px] w-[14.5px] text-white"
          initial={reduce ? false : { y: '70%', opacity: 0.3 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: '-70%', opacity: 0.3 }}
          transition={{ ...motionTransitions.springSnappy, delay: reduce ? 0 : i * 0.015 }}
        >
          <path d={OFF} fill="currentColor" opacity="0.14" />
          <path d={ON[ch]} fill="currentColor" />
        </motion.svg>
      </AnimatePresence>
      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/40" />
    </span>
  );
});

export function MatrixTimer({ endsAt, className }: { endsAt: number; className?: string }) {
  const reduce = !!useReducedMotion();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = Math.max(0, Math.floor((endsAt - now) / 1000));
  const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  const txt = `${p(h)}:${p(m)}:${p(s)}`;
  const urgent = left < 600;
  return (
    <div className={cn('flex items-center gap-[3px] rounded-[9px] transition-colors', urgent && 'p-[3px] bg-[#ef4444] [&_span.bg-ink]:bg-[#7f1d1d]', className)}
      aria-label={`${h} hours ${m} minutes ${s} seconds left`} title="Time left">
      {txt.split('').map((ch, i) => ch === ':'
        ? <em key={i} className={cn('not-italic font-bold px-px -mt-0.5', i === 5 && 'hidden sm:inline-flex', urgent ? 'text-white' : 'text-faint')}>:</em>
        : <span key={i} className={i >= 6 ? 'hidden sm:inline-flex' : 'inline-flex'}><Tile ch={ch} i={i} reduce={reduce} /></span>)}
    </div>
  );
}
