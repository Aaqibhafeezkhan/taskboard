import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { Answer, Card } from '../../../shared/types.ts';
import { cn } from '../lib/utils.ts';
import { motionTransitions } from '../lib/motion-tokens.ts';
import { agentActive, canDrive, isOnCard, modelLabel, since, tint, useStore, userColor } from '../state/store.ts';
import { LiveImage } from './LiveImage.tsx';
import { CopyButton, Dot, NameChip } from './ui.tsx';
import { TextScrambleDecoder } from './easyui/TextScrambleDecoder.tsx';

export function useNow(every = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), every); return () => clearInterval(t); }, [every]);
  return now;
}

export function Shots({ card, height = 54, max = 2, onOpen }: { card: Card; height?: number; max?: number; onOpen?: (i: number) => void }) {
  if (!card.screenshots.length) return null;
  const shown = card.screenshots.slice(0, max);
  const more = card.screenshots.length - shown.length;
  return (
    <div className="flex gap-1.5">
      {shown.map((s, i) => (
        <div key={s.id} onClick={onOpen ? (e) => { e.stopPropagation(); onOpen(i); } : undefined}
          className={cn('flex-1 min-w-0 rounded-[9px] border border-line bg-[#fafafa] overflow-hidden', onOpen && 'cursor-zoom-in')} style={{ height }}>
          <img src={s.url} alt="" loading="lazy" draggable={false} className="w-full h-full object-cover object-top" />
        </div>
      ))}
      {more > 0 && <div className="flex-none w-[34px] flex items-center justify-center text-[11px] text-muted">+{more}</div>}
    </div>
  );
}

/** Segmented tracker of who entered the answer (animation E/N: segments fill). */
export function EnteredTracker({ card }: { card: Card }) {
  const users = useStore((s) => s.users);
  const total = users.length;
  const n = users.filter((u) => card.entered[u.login]).length;
  return (
    <div className="flex items-center gap-1.5 text-[11.5px] min-w-0">
      <div className="flex gap-[3px]">
        {users.map((u) => (
          <span key={u.login} className="relative w-3.5 h-1.5 rounded-[3px] bg-surface2 overflow-hidden" title={`${u.login}${card.entered[u.login] ? ' entered everything' : ''}`}>
            <motion.span className="absolute inset-0 bg-ok rounded-[3px] origin-left" initial={false} animate={{ scaleX: card.entered[u.login] ? 1 : 0 }} transition={motionTransitions.springSnappy} />
          </span>
        ))}
      </div>
      {n === total && total > 0
        ? <span className="text-ok-ink whitespace-nowrap">everyone entered ✓</span>
        : <span className="text-muted whitespace-nowrap">{n} of {total}{' '}<span className="hidden 2xl:inline">entered</span></span>}
    </div>
  );
}

export function EnteredButton({ card, className }: { card: Card; className?: string }) {
  const me = useStore((s) => s.me);
  const setEntered = useStore((s) => s.setEntered);
  if (!me) return null;
  const done = !!card.entered[me.login];
  return (
    <motion.button
      layout
      whileTap={{ scale: 0.94 }}
      transition={motionTransitions.springSnappy}
      onClick={(e) => { e.stopPropagation(); setEntered(card.id, !done); }}
      className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap cursor-pointer',
        done ? 'bg-ok-bg text-ok-ink border border-ok-line' : 'bg-ink text-white hover:bg-[#27272a]', className)}
      title={done ? 'Click to undo' : 'I typed this answer into my own account'}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {done ? (
          <motion.span key="d" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="inline-flex items-center gap-1">
            <svg viewBox="0 0 16 16" className="size-3"><motion.path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, ease: 'easeOut' }} /></svg>
            You entered it
          </motion.span>
        ) : (
          <motion.span key="n" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{(card.answers?.length ?? 0) > 1 ? "I've entered all" : "I've entered it"}</motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export function AnswerPill({ card, big }: { card: Card; big?: boolean }) {
  const celebrate = useStore((s) => s.celebrate);
  const fresh = celebrate?.cardId === card.id && Date.now() - celebrate.at < 4000;
  return (
    <div className={cn('flex items-center gap-2 rounded-[12px] bg-ok-bg border border-ok-line', big ? 'p-3 pl-4 rounded-[16px]' : 'py-[7px] pr-[7px] pl-[11px]')}>
      {/* F: a freshly found answer decodes from scrambled glyphs */}
      {fresh
        ? <TextScrambleDecoder text={card.answer || ''} className={cn('flex-1 font-mono font-bold tracking-[.3px] !text-[#065f46]', big ? 'text-[18px]' : 'text-[13.5px]')} />
        : <span className={cn('flex-1 font-mono font-bold tracking-[.3px] text-[#065f46] truncate', big ? 'text-[18px]' : 'text-[13.5px]')}>{card.answer}</span>}
      <CopyButton text={card.answer || ''} />
    </div>
  );
}

/** One answer: label chip ("Q1", hidden when empty), the value, Copy. Fresh answers decode from scrambled glyphs. */
export function AnswerRow({ a, big, className, children }: { a: Answer; big?: boolean; className?: string; children?: React.ReactNode }) {
  const fresh = Date.now() - a.at < 4000;
  return (
    <motion.div layout="position" initial={fresh ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={motionTransitions.springSnappy}
      className={cn('flex items-center gap-2 bg-ok-bg border border-ok-line min-w-0', big ? 'py-2 pr-2 pl-3 rounded-[14px]' : 'py-[6px] pr-[6px] pl-[9px] rounded-[12px]', className)}>
      {a.label && <span className={cn('flex-none font-semibold text-[#047857] bg-white border border-ok-line rounded-full', big ? 'text-[11.5px] px-2 py-0.5' : 'text-[10.5px] px-1.5 py-px')}>{a.label}</span>}
      {fresh
        ? <TextScrambleDecoder text={a.value} className={cn('flex-1 min-w-0 font-mono font-bold tracking-[.3px] !text-[#065f46]', big ? 'text-[16px]' : 'text-[13px]')} />
        : <span className={cn('flex-1 min-w-0 font-mono font-bold tracking-[.3px] text-[#065f46] truncate', big ? 'text-[16px]' : 'text-[13px]')} title={a.value}>{a.value}</span>}
      {children}
      <CopyButton text={a.value} />
    </motion.div>
  );
}

/** Every answer of a card, compact: the first `max` rows, then "+N more" (opens the card). */
export function AnswerList({ card, max = 3, onMore }: { card: Card; max?: number; onMore?: () => void }) {
  const list = card.answers ?? [];
  const shown = list.slice(0, max);
  const more = list.length - shown.length;
  return (
    <div className="flex flex-col gap-1.5">
      {shown.map((a) => <AnswerRow key={a.id} a={a} />)}
      {(more > 0 || !card.allAnswered) && (
        <div className="flex items-center gap-2 text-[11px] text-muted px-0.5">
          {more > 0 && <button onClick={(e) => { e.stopPropagation(); onMore?.(); }} className="text-info cursor-pointer hover:underline">+{more} more</button>}
          {!card.allAnswered && <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-[#a1a1aa] animate-pulse" />more coming</span>}
        </div>
      )}
    </div>
  );
}

export function AgentBadge({ card }: { card: Card }) {
  const a = card.agent!;
  if (a.state === 'needs_help') return <span className="absolute top-1.5 left-1.5 bg-warn text-white text-[10px] font-semibold px-[7px] py-0.5 rounded-full flex items-center gap-[5px]"><Dot tone="white" />NEEDS HELP</span>;
  if (a.driver === 'human') return <span className="absolute top-1.5 left-1.5 bg-info text-white text-[10px] font-semibold px-[7px] py-0.5 rounded-full flex items-center gap-[5px]">✋ {a.driverLogin} DRIVING</span>;
  if (a.state === 'starting') return <span className="absolute top-1.5 left-1.5 bg-ink/80 text-white text-[10px] font-semibold px-[7px] py-0.5 rounded-full">STARTING…</span>;
  return <span className="absolute top-1.5 left-1.5 bg-ink/80 text-white text-[10px] font-semibold px-[7px] py-0.5 rounded-full flex items-center gap-[5px]"><Dot pulse />LIVE</span>;
}

interface Props {
  card: Card;
  dragging?: boolean;
  overlay?: boolean;
  onOpen?: () => void;
  handleProps?: React.HTMLAttributes<HTMLElement>;
}

export function CardItem({ card, dragging, overlay, onOpen }: Props) {
  const me = useStore((s) => s.me);
  const users = useStore((s) => s.users);
  const models = useStore((s) => s.models);
  const selected = useStore((s) => s.selected.includes(card.id));
  const set = useStore((s) => s.set);
  const join = useStore((s) => s.join);
  const now = useNow();
  const mine = isOnCard(me, card);
  const a = card.agent;
  const active = agentActive(card);
  const help = a?.state === 'needs_help';
  const tickable = card.column !== 'done' && !active && canDrive(me, card);
  const myColor = me ? userColor(users, me.login) : '#f59e0b';
  const hasAnswers = (card.answers?.length ?? 0) > 0;

  return (
    <div
      onClick={onOpen}
      data-card={overlay ? undefined : card.id}
      className={cn('relative bg-white border border-line rounded-card p-[11px] flex flex-col gap-2 shadow-card cursor-pointer select-none transition-shadow hover:shadow-[0_4px_14px_#0000000f]',
        help && 'border-warn-line bg-[#fffdf6] help-pulse',
        dragging && !overlay && 'opacity-30',
        overlay && 'shadow-[0_18px_40px_#00000026] cursor-grabbing')}
      style={{
        boxShadow: selected ? '0 0 0 2px #2563eb' : mine ? `0 0 0 2px ${tint(myColor, 0.4)}, 0 1px 2px #0000000a` : undefined,
      }}
    >
      <div className="flex items-start gap-2">
        {tickable && (
          <button
            onClick={(e) => { e.stopPropagation(); set({ selected: selected ? useStore.getState().selected.filter((x) => x !== card.id) : [...useStore.getState().selected, card.id] }); }}
            className={cn('mt-[2px] size-4 rounded-[5px] border-[1.5px] flex items-center justify-center flex-none cursor-pointer transition-colors', selected ? 'bg-info border-info' : 'border-[#d4d4d8] bg-white hover:border-[#a1a1aa]')}
            aria-label={selected ? 'Unselect' : 'Select for starting agents'}
          >
            <AnimatePresence>{selected && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={motionTransitions.springSnappy}><Check className="size-3 text-white" strokeWidth={3.5} /></motion.span>}</AnimatePresence>
          </button>
        )}
        <span className="font-semibold text-[13.5px] tracking-[-.1px] leading-snug">{card.title}</span>
      </div>

      {active && a ? (
        <>
          <div className="relative h-[92px] rounded-[10px] border border-line overflow-hidden">
            {!overlay && <LiveImage cardId={card.id} fps={2} width={480} className="absolute inset-0" />}
            <AgentBadge card={card} />
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] min-w-0">
            <Dot tone={help ? 'warn' : a.driver === 'human' ? 'grey' : 'ok'} pulse={!help && a.state === 'running'} />
            <b className="font-semibold">Agent</b>
            <span className="text-muted truncate">{modelLabel(models, a.model).replace(/^Claude /, '')} · {since(a.startedAt, now)}</span>
            <span className="flex-1" />
            {card.people[0] && <NameChip login={card.people[0]} label={card.people[0] === me?.login ? 'You' : undefined} />}
          </div>
          <div className={cn('text-[11px] truncate', help ? 'text-warn-ink' : 'text-muted')}>
            {help ? `“${a.question || a.lastStep}”` : `› ${a.lastStep || 'starting…'}`}
          </div>
          {hasAnswers && <AnswerList card={card} onMore={onOpen} />}
        </>
      ) : !hasAnswers && (
        <Shots card={card} />
      )}

      {hasAnswers && !active ? (
        <>
          <AnswerList card={card} onMore={onOpen} />
          <div className="flex items-center gap-2 justify-between">
            <EnteredTracker card={card} />
            {!(me && users.every((u) => card.entered[u.login])) && <EnteredButton card={card} />}
          </div>
        </>
      ) : !active && (
        <div className="flex items-center gap-1.5 text-[11.5px] text-muted flex-wrap">
          {card.people.length ? card.people.map((p) => <NameChip key={p} login={p} label={p === me?.login ? 'You' : undefined} />) : (
            <>nobody on it · <button onClick={(e) => { e.stopPropagation(); join(card.id); }} className="text-info cursor-pointer hover:underline">Join</button></>
          )}
          {a && a.state === 'finished' && !hasAnswers && <span>· agent ended without an answer</span>}
          {a && a.state === 'stopped' && <span>· agent stopped</span>}
          {a && a.state === 'error' && <span className="text-bad">· agent error</span>}
          {!a && card.people.includes(me?.login || '') && card.column === 'working' && <span>working by hand</span>}
        </div>
      )}
    </div>
  );
}
