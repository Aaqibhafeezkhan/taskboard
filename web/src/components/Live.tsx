import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { Hand, Maximize2, Square, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '../lib/utils.ts';
import { motionTransitions } from '../lib/motion-tokens.ts';
import { agentActive, canDrive, modelLabel, since, useStore } from '../state/store.ts';
import type { LiveMeta } from '../api/transport.ts';
import { AgentBadge, useNow } from './CardItem.tsx';
import { LiveImage } from './LiveImage.tsx';
import { StepList } from './Steps.tsx';
import { Logo } from './TopBar.tsx';
import { Btn, Dot, ModelSelect, NameChip, Pill } from './ui.tsx';

/** Screen 3: every running agent's browser at once (P: tiles reorder smoothly, Q: needs-help pulses). */
export function LiveWall() {
  const cards = useStore((s) => s.cards);
  const models = useStore((s) => s.models);
  const me = useStore((s) => s.me);
  const set = useStore((s) => s.set);
  const takeover = useStore((s) => s.takeover);
  const now = useNow();
  const list = useMemo(() => Object.values(cards).filter(agentActive)
    .sort((a, b) => (a.agent!.state === 'needs_help' ? -1 : 0) - (b.agent!.state === 'needs_help' ? -1 : 0) || (a.agent!.startedAt || 0) - (b.agent!.startedAt || 0)), [cards]);

  return (
    <div className="flex-1 overflow-y-auto thin-scroll px-4 sm:pl-12 sm:pr-6 pb-6">
      <LayoutGroup>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 2xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {list.map((c) => {
              const a = c.agent!;
              const help = a.state === 'needs_help';
              return (
                <motion.div key={c.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={motionTransitions.springSmooth}
                  className={cn('bg-white border border-line rounded-card p-2.5 flex flex-col gap-2 shadow-card', help && 'border-warn-line bg-[#fffdf6] help-pulse')}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Dot tone={help ? 'warn' : 'ok'} pulse={!help} />
                    <button onClick={() => set({ openCardId: c.id, openStepId: null })} className="font-semibold truncate cursor-pointer hover:underline">{c.title}</button>
                    <span className="text-muted text-[11.5px] whitespace-nowrap">{modelLabel(models, a.model).replace(/^Claude /, '')} · {since(a.startedAt, now)}</span>
                    <div className="flex-1" />
                    {c.people[0] ? <NameChip login={c.people[0]} /> : <span className="text-[11px] text-faint">nobody</span>}
                  </div>
                  <button onClick={() => set({ liveCardId: c.id })} className="relative aspect-[16/10] rounded-[10px] border border-line overflow-hidden cursor-zoom-in">
                    <LiveImage cardId={c.id} fps={4} width={640} className="absolute inset-0" />
                    <AgentBadge card={c} />
                  </button>
                  <div className="flex items-center gap-1.5">
                    <span className={cn('flex-1 truncate text-[11px]', help ? 'text-warn-ink' : 'text-muted')}>› {help ? a.question || a.lastStep : a.lastStep || 'starting…'}</span>
                    <Btn tone="white" size="xs" className="py-[3px] px-2.5" onClick={() => set({ liveCardId: c.id })}><Maximize2 className="size-3" />Open</Btn>
                    {canDrive(me, c) && a.driver !== 'human' && <Btn tone="white" size="xs" className="py-[3px] px-2" title="Take over" onClick={() => { takeover(c.id); set({ liveCardId: c.id }); }}><Hand className="size-3" /></Btn>}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          <motion.div layout className="rounded-card border-[1.5px] border-dashed border-[#d4d4d8] flex flex-col items-center justify-center text-muted gap-1 min-h-[240px] p-6 text-center">
            <b className="text-ink">{list.length ? 'Start more agents' : 'No agents running'}</b>
            <span className="text-[11.5px]">tick cards on the board, then press Start</span>
            <Btn tone="ghost" size="sm" className="mt-2" onClick={() => set({ view: 'board' })}>Go to the board</Btn>
          </motion.div>
        </div>
      </LayoutGroup>
    </div>
  );
}

/** Screen 4: one agent, big live picture, take over / hand back, steps, tell the agent something. */
export function LiveView() {
  const liveCardId = useStore((s) => s.liveCardId);
  const card = useStore((s) => (s.liveCardId ? s.cards[s.liveCardId] : undefined));
  const me = useStore((s) => s.me);
  const models = useStore((s) => s.models);
  const st = useStore();
  const [meta, setMeta] = useState<LiveMeta | null>(null);
  const [msg, setMsg] = useState('');
  const [width, setWidth] = useState(1280);
  useEffect(() => { setWidth(Math.min(1280, Math.round(window.innerWidth * (window.devicePixelRatio > 1 ? 1.2 : 1)))); }, []);
  useEffect(() => {
    if (!liveCardId) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && card?.agent?.driver !== 'human') st.set({ liveCardId: null }); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [liveCardId, card?.agent?.driver]); // eslint-disable-line react-hooks/exhaustive-deps

  const a = card?.agent;
  const human = a?.driver === 'human';
  const meDriving = human && a?.driverLogin === me?.login;
  const drive = card ? canDrive(me, card) : false;
  const active = card ? agentActive(card) : false;

  return (
    <AnimatePresence>
      {card && (
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={motionTransitions.springSmooth}
          className="fixed inset-0 z-50 bg-white flex flex-col">
          <header className="h-16 flex-none flex items-center gap-2.5 px-4 sm:pl-12 sm:pr-6 border-b border-line overflow-x-auto no-scrollbar">
            <span className="hidden sm:inline"><Logo /></span>
            <span className="text-faint hidden sm:inline">/</span>
            <button className="font-semibold truncate cursor-pointer hover:underline" onClick={() => st.set({ liveCardId: null, openCardId: card.id })}>{card.title}</button>
            <span className="text-faint">/</span><span className="whitespace-nowrap">Live view</span>
            <div className="flex-1" />
            {/* S: the driver pill morphs between agent and person */}
            <motion.span layout transition={motionTransitions.springSnappy}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={human ? 'h' : 'a'} initial={{ opacity: 0, scale: 0.9, filter: 'blur(3px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: 0.9 }} transition={motionTransitions.springSnappy} className="inline-flex">
                  {human
                    ? <Pill tone="blue">✋ {meDriving ? "You're driving" : `${a?.driverLogin} is driving`}</Pill>
                    : a?.state === 'needs_help' ? <Pill tone="amber"><Dot tone="warn" />Agent needs help</Pill>
                    : active ? <Pill tone="green"><Dot pulse />Agent is driving</Pill> : <Pill>Agent {a?.state || 'idle'}</Pill>}
                </motion.span>
              </AnimatePresence>
            </motion.span>
            {a && <Pill tone="white" className="hidden md:inline-flex">Model: {modelLabel(models, a.model)}</Pill>}
            {drive && active && (human
              ? <Btn tone="dark" onClick={() => st.handback(card.id)}>↩ Hand back to agent</Btn>
              : <Btn tone="dark" onClick={() => st.takeover(card.id)}><Hand className="size-3.5" />Take over</Btn>)}
            {drive && active && <Btn tone="red" onClick={() => st.stopAgent(card.id)}><Square className="size-3 fill-current" />Stop</Btn>}
            <Btn tone="ghost" onClick={() => st.set({ liveCardId: null })}><X className="size-3.5" /><span className="hidden sm:inline">Back to board</span></Btn>
          </header>
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-[18px] px-3 sm:pl-12 sm:pr-6 py-[18px]">
            <div className="flex-1 min-w-0 min-h-0 border border-line rounded-[14px] overflow-hidden flex flex-col bg-white">
              <div className="h-[34px] flex-none bg-surface flex items-center gap-2 px-3 border-b border-line">
                <span className="flex gap-[5px]"><i className="size-[9px] rounded-full bg-[#d4d4d8]" /><i className="size-[9px] rounded-full bg-[#d4d4d8]" /><i className="size-[9px] rounded-full bg-[#d4d4d8]" /></span>
                <span className="flex-1 bg-white rounded-full px-3 py-[3px] text-[11px] text-muted font-mono truncate">{meta?.url || card.link.replace(/^https?:\/\//, '')}</span>
                {meta?.width && <span className="text-[10.5px] text-muted hidden sm:inline">{meta.width}×{meta.height} · 15 fps</span>}
              </div>
              <div className="flex-1 min-h-0 flex items-start justify-center bg-[#fafafa]">
                <LiveImage cardId={card.id} fps={15} width={width} interactive={meDriving} onMeta={setMeta}
                  className="w-full max-h-full aspect-[16/10]" imgClassName="object-contain">
                  {meDriving && <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-ink/85 text-white text-[11.5px] px-3 py-1 rounded-full pointer-events-none">You're driving: click and type into the page · Hand back when done</div>}
                  {!active && <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-muted">The agent isn't running</div>}
                </LiveImage>
              </div>
            </div>
            <div className="lg:w-[380px] flex-none flex flex-col gap-3 min-h-0 max-h-[45vh] lg:max-h-none">
              <div className="bg-surface rounded-[16px] px-3.5 py-3 flex flex-col gap-1">
                <span className="text-[10.5px] uppercase tracking-[.7px] text-faint font-semibold">Task</span>
                <span className="text-[12px] line-clamp-4">{card.task}</span>
              </div>
              <div className="flex items-center"><b>What it's doing</b><div className="flex-1" /><span className="text-[10.5px] text-muted">auto-scrolls</span></div>
              <StepList cardId={card.id} running={a?.state === 'running'} className="flex-1 min-h-0" />
              {drive && active && (
                <form className="border border-line rounded-[18px] px-3 py-2.5 bg-white shadow-[0_2px_10px_#0000000d] flex-none"
                  onSubmit={(e) => { e.preventDefault(); if (msg.trim()) { st.messageAgent(card.id, msg.trim()); setMsg(''); } }}>
                  <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={2} placeholder={'Tell this agent something… (e.g. "skip the phone step")'}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }}
                    className="w-full resize-none outline-none placeholder:text-faint" />
                  <div className="flex"><div className="flex-1" /><Btn tone="dark" size="sm">Send</Btn></div>
                </form>
              )}
              {drive && !active && <ModelSelect value={a?.model || ''} onChange={(m) => st.startAgent(card.id, m)} up />}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
