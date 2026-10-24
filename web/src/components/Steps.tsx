import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { Step } from '../../../shared/types.ts';
import { cn } from '../lib/utils.ts';
import { motionTransitions } from '../lib/motion-tokens.ts';
import { useStore } from '../state/store.ts';
import { Highlight } from './ui.tsx';

const EMPTY: Step[] = [];

export function useSteps(cardId: string) {
  const steps = useStore((s) => s.steps[cardId]) || EMPTY;
  const loadSteps = useStore((s) => s.loadSteps);
  const updatedAt = useStore((s) => s.cards[cardId]?.updatedAt);
  const loaded = useRef(false);
  useEffect(() => { loaded.current = false; }, [cardId]);
  useEffect(() => {
    if (!loaded.current) { loaded.current = true; loadSteps(cardId).catch(() => { loaded.current = false; }); }
  }, [cardId, loadSteps, updatedAt]);
  return steps;
}

function hhmm(at: number) { return new Date(at).toTimeString().slice(0, 5); }

/** M: new steps slide in, the running one has a spinning ring, finished ones draw their check. */
export function StepList({ cardId, running, focusStepId, highlight, className, autoScroll = true }: {
  cardId: string; running: boolean; focusStepId?: number | null; highlight?: string; className?: string; autoScroll?: boolean;
}) {
  const steps = useSteps(cardId);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    if (focusStepId) {
      const t = el.querySelector(`[data-step="${focusStepId}"]`) as HTMLElement | null;
      if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    }
    if (autoScroll) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [steps.length, focusStepId, autoScroll]);

  if (!steps.length) return <div className={cn('text-faint text-[12px] py-4', className)}>No steps yet.</div>;
  return (
    <div ref={box} className={cn('overflow-y-auto thin-scroll pr-1', className)}>
      <AnimatePresence initial={false}>
        {steps.map((st, i) => {
          const last = i === steps.length - 1;
          const live = last && running;
          const tone = st.kind === 'help' ? 'warn' : st.kind === 'human' ? 'info' : st.kind === 'answer' ? 'ok' : st.kind === 'system' ? 'grey' : 'ok';
          const focus = focusStepId === st.id;
          return (
            <motion.div key={st.id} data-step={st.id} layout="position" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={motionTransitions.springSmooth}
              className={cn('flex gap-2.5 py-[7px] relative rounded-[10px] px-1 -mx-1', focus && 'bg-[#fef9c3]')}>
              {!last && <span className="absolute left-[13.5px] top-[30px] -bottom-[6px] w-px bg-line" />}
              <span className={cn('relative z-[1] size-5 rounded-full flex items-center justify-center flex-none text-[11px] border',
                live ? 'bg-white border-2 border-ok' : tone === 'warn' ? 'bg-warn-bg border-warn-line text-warn' : tone === 'info' ? 'bg-info-bg border-[#bfdbfe] text-info' : tone === 'grey' ? 'bg-surface border-line text-muted' : 'bg-ok-bg border-ok-line text-ok')}>
                {live ? (
                  <motion.span className="absolute inset-[-2px] rounded-full border-2 border-transparent border-t-ok" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }} />
                ) : st.kind === 'help' ? '!' : st.kind === 'human' ? '✋' : st.kind === 'thought' ? '…' : (
                  <svg viewBox="0 0 16 16" className="size-3"><motion.path d="M3.5 8.5l3 3L12.5 5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3 }} /></svg>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className={cn('font-semibold text-[12.5px]', st.kind === 'answer' && 'text-ok-ink')}><Highlight text={st.title} q={highlight || ''} /></div>
                {st.text && <div className={cn('text-[11.5px] text-muted break-words', st.kind === 'thought' && 'italic')}><Highlight text={st.kind === 'thought' ? `“${st.text}”` : st.text} q={highlight || ''} /></div>}
              </div>
              <span className="ml-auto text-[11px] text-faint whitespace-nowrap pl-2">{live ? 'now' : hhmm(st.at)}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
