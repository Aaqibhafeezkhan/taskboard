import {
  closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { Play, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Card, Column } from '../../../shared/types.ts';
import { cn } from '../lib/utils.ts';
import { motionTransitions } from '../lib/motion-tokens.ts';
import { agentActive, useStore, type Filter } from '../state/store.ts';
import { CardItem } from './CardItem.tsx';
import { ModelSelect } from './ui.tsx';
import { AnimatedNumber } from './easyui/AnimatedNumber.tsx';

const LANES: { id: Column; title: string }[] = [
  { id: 'todo', title: 'To do' },
  { id: 'working', title: 'Working' },
  { id: 'done', title: 'Done' },
];

export function Seg<T extends string>({ items, value, onChange, id }: { items: { id: T; label: string }[]; value: T; onChange: (v: T) => void; id: string }) {
  return (
    <div className="inline-flex p-[3px] rounded-full bg-surface gap-0.5 flex-none">
      {items.map((it) => (
        <button key={it.id} onClick={() => onChange(it.id)} className={cn('relative px-[13px] py-[5px] rounded-full text-[12.5px] cursor-pointer whitespace-nowrap transition-colors', value === it.id ? 'text-ink' : 'text-muted hover:text-ink')}>
          {value === it.id && <motion.span layoutId={`seg-${id}`} transition={motionTransitions.springSnappy} className="absolute inset-0 rounded-full bg-white shadow-[0_1px_3px_#00000014]" />}
          <span className="relative">{it.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Toolbar() {
  const view = useStore((s) => s.view);
  const filter = useStore((s) => s.filter);
  const cards = useStore((s) => s.cards);
  const set = useStore((s) => s.set);
  const list = Object.values(cards);
  const running = list.filter((c) => c.agent && ['running', 'starting', 'paused'].includes(c.agent.state)).length;
  const help = list.filter((c) => c.agent?.state === 'needs_help').length;
  return (
    <div className="flex items-center gap-2.5 px-4 sm:pl-12 sm:pr-6 pt-3.5 pb-2.5 overflow-x-auto no-scrollbar flex-none">
      <Seg id="view" value={view} onChange={(v) => set({ view: v })} items={[{ id: 'board', label: 'Board' }, { id: 'wall', label: 'Live wall' }]} />
      {view === 'board'
        ? <Seg id="filter" value={filter} onChange={(v: Filter) => set({ filter: v })} items={[{ id: 'everyone', label: 'Everyone' }, { id: 'mine', label: 'Mine' }, { id: 'running', label: 'Agent running' }, { id: 'nobody', label: 'Nobody on it' }]} />
        : <span className="text-muted text-[11.5px] whitespace-nowrap">every running agent's browser, live</span>}
      <div className="flex-1" />
      <span className="text-[11.5px] text-muted whitespace-nowrap">
        <AnimatedNumber value={running} className="text-muted font-sans" /> agents running{help > 0 && <> · <span className="text-warn-ink">{help} needs help</span></>}
      </span>
    </div>
  );
}

function SortableCard({ card }: { card: Card }) {
  const set = useStore((s) => s.set);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, data: { column: card.column } });
  // dnd-kit owns the outer transform; framer owns the inner pop-in / morph (K) so they never fight.
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} {...attributes} {...listeners}>
      <motion.div
        layoutId={`card-${card.id}`}
        initial={{ opacity: 0, scale: 0.92, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
        transition={{ ...motionTransitions.springSmooth, layout: motionTransitions.springSnappy }}
      >
        <CardItem card={card} dragging={isDragging} onOpen={() => set({ openCardId: card.id, openStepId: null })} />
      </motion.div>
    </div>
  );
}

function Lane({ id, title, cards }: { id: Column; title: string; cards: Card[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane-${id}`, data: { column: id } });
  const [limit, setLimit] = useState(id === 'done' ? 6 : 999);
  const shown = cards.slice(0, limit);
  const owner = useStore((s) => s.me?.role === 'owner');
  const set = useStore((s) => s.set);
  return (
    <div ref={setNodeRef} className={cn('flex-1 min-w-[268px] max-w-[520px] bg-surface rounded-lane p-3 flex flex-col gap-2.5 min-h-0 transition-colors', isOver && 'bg-surface2')}>
      <div className="flex items-center gap-2 px-1.5 pt-1 pb-0.5 font-semibold">
        {title}
        <span className="text-[11px] text-muted bg-white rounded-full px-2 py-px font-normal"><AnimatedNumber value={cards.length} className="text-muted font-sans" /></span>
        {id === 'todo' && owner && (
          <button onClick={() => set({ newTask: { open: true, files: [] } })} title="New task (or paste screenshots anywhere on the board)"
            className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-line text-[11.5px] font-medium cursor-pointer hover:bg-[#fafafa] active:scale-[0.97] transition-transform">
            <Plus className="size-3.5" />New task
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2.5 overflow-y-auto thin-scroll -mx-1 px-1 -mt-1 pt-1 pb-24 min-h-[60px]">
        <SortableContext items={shown.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <AnimatePresence initial={false}>
            {shown.map((c) => <SortableCard key={c.id} card={c} />)}
          </AnimatePresence>
        </SortableContext>
        {cards.length > shown.length && (
          <button onClick={() => setLimit(999)} className="text-faint text-[11.5px] text-center py-1 cursor-pointer hover:text-muted">+ {cards.length - shown.length} more</button>
        )}
        {!cards.length && <div className="text-faint text-[11.5px] text-center py-6">{id === 'todo' ? (owner ? 'Paste screenshots (⌘V) or press New task' : 'New tasks land here') : 'Nothing here yet'}</div>}
      </div>
    </div>
  );
}

function sortLane(list: Card[], col: Column) {
  return list.filter((c) => c.column === col).sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
}

export function Board() {
  const cards = useStore((s) => s.cards);
  const filter = useStore((s) => s.filter);
  const me = useStore((s) => s.me);
  const moveCard = useStore((s) => s.moveCard);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<Column | null>(null);

  const filtered = useMemo(() => Object.values(cards).filter((c) => {
    if (filter === 'mine') return !!me && c.people.includes(me.login);
    if (filter === 'running') return agentActive(c);
    if (filter === 'nobody') return c.people.length === 0;
    return true;
  }), [cards, filter, me]);

  // while dragging across lanes, show the card in the lane it hovers
  const view = useMemo(() => filtered.map((c) => (c.id === activeId && overCol ? { ...c, column: overCol } : c)), [filtered, activeId, overCol]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const colOf = (id: string | number | undefined): Column | null => {
    if (!id) return null;
    const s = String(id);
    if (s.startsWith('lane-')) return s.slice(5) as Column;
    return view.find((c) => c.id === s)?.column ?? null;
  };

  const onStart = (e: DragStartEvent) => { setActiveId(String(e.active.id)); setOverCol(null); };
  const onOver = (e: DragOverEvent) => { const c = colOf(e.over?.id); if (c) setOverCol(c); };
  const onEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    const col = colOf(e.over?.id) || cards[id]?.column;
    setActiveId(null); setOverCol(null);
    if (!col || !cards[id]) return;
    const lane = sortLane(Object.values(cards).filter((c) => c.id !== id), col);
    let idx = lane.length;
    const overId = e.over?.id ? String(e.over.id) : '';
    if (overId && !overId.startsWith('lane-')) {
      const oi = lane.findIndex((c) => c.id === overId);
      if (oi >= 0) {
        const fromSameLane = cards[id].column === col;
        const oldIdx = sortLane(Object.values(cards), col).findIndex((c) => c.id === id);
        idx = fromSameLane && oldIdx >= 0 && oldIdx <= oi ? oi + 1 : oi;
      }
    }
    const prev = lane[idx - 1], next = lane[idx];
    const position = prev && next ? (prev.position + next.position) / 2 : prev ? prev.position + 1 : next ? next.position - 1 : 0;
    if (cards[id].column === col && Math.abs(cards[id].position - position) < 1e-9) return;
    moveCard(id, col, position);
  };

  const active = activeId ? cards[activeId] : null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={() => { setActiveId(null); setOverCol(null); }}>
      <LayoutGroup>
        <div className="flex-1 flex gap-3.5 px-4 sm:pl-12 sm:pr-6 pb-6 min-h-0 overflow-x-auto thin-scroll snap-x snap-mandatory scroll-px-4 sm:snap-none">
          {LANES.map((l) => <div key={l.id} className="flex snap-start min-w-[86vw] sm:min-w-0 flex-1"><Lane id={l.id} title={l.title} cards={sortLane(view, l.id)} /></div>)}
        </div>
      </LayoutGroup>
      {/* C: the dragged card lifts and tilts */}
      <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
        {active ? (
          <motion.div initial={{ rotate: 0, scale: 1 }} animate={{ rotate: -2.5, scale: 1.03 }} transition={motionTransitions.springSnappy}>
            <CardItem card={active} overlay />
          </motion.div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** J: tray slides up when cards are ticked; count morphs as you tick more. */
export function BatchTray() {
  const selected = useStore((s) => s.selected);
  const lastModel = useStore((s) => s.lastModel);
  const models = useStore((s) => s.models);
  const startAgents = useStore((s) => s.startAgents);
  const set = useStore((s) => s.set);
  const [model, setModel] = useState(lastModel);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!model && models[0]) setModel(models[0].id); }, [models, model]);
  const n = selected.length;
  return (
    <AnimatePresence>
      {n > 0 && (
        <motion.div
          initial={{ y: 90, opacity: 0, x: '-50%' }}
          animate={{ y: 0, opacity: 1, x: '-50%' }}
          exit={{ y: 90, opacity: 0, x: '-50%' }}
          transition={motionTransitions.springSmooth}
          className="fixed left-1/2 xl:left-[calc((100%-392px)/2)] bottom-6 z-30 flex items-center gap-2.5 py-2 pr-2 pl-[18px] rounded-full bg-ink text-white shadow-[0_16px_40px_#0000003a] max-w-[calc(100vw-24px)]"
        >
          <b className="whitespace-nowrap"><AnimatedNumber value={n} className="text-white font-sans" /> selected</b>
          <ModelSelect value={model} onChange={setModel} dark up align="left" />
          <motion.button
            whileTap={{ scale: 0.95 }}
            disabled={busy || !model}
            onClick={async () => { setBusy(true); try { await startAgents(selected, model); } finally { setBusy(false); } }}
            className="bg-white text-ink font-bold px-4 py-[7px] rounded-full text-[12.5px] cursor-pointer flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
          >
            <Play className="size-3.5 fill-current" /> {busy ? 'Starting…' : `Start ${n} agent${n === 1 ? '' : 's'}`}
          </motion.button>
          <button onClick={() => set({ selected: [] })} className="p-2 rounded-full text-faint hover:text-white cursor-pointer" aria-label="Clear selection"><X className="size-4" /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
