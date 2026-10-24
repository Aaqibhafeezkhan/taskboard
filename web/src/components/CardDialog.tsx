import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { ExternalLink, Hand, Maximize2, Play, Square, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Answer, Card } from '../../../shared/types.ts';
import { cn } from '../lib/utils.ts';
import { motionTransitions } from '../lib/motion-tokens.ts';
import { agentActive, canDrive, isOnCard, since, useStore, userColor } from '../state/store.ts';
import { AnswerRow, useNow } from './CardItem.tsx';
import { LiveImage } from './LiveImage.tsx';
import { StepList } from './Steps.tsx';
import { Btn, Dot, Label, ModelSelect, NameChip, Pill } from './ui.tsx';

/** O: hold to delete (fills red), then the dialog dissolves into particles. */
function HoldToDelete({ onConfirm }: { onConfirm: () => void }) {
  const [p, setP] = useState(0);
  const timer = useRef<number | null>(null);
  const start = () => {
    const t0 = performance.now();
    const tick = () => {
      const v = Math.min(1, (performance.now() - t0) / 1100);
      setP(v);
      if (v >= 1) { timer.current = null; onConfirm(); return; }
      timer.current = requestAnimationFrame(tick);
    };
    timer.current = requestAnimationFrame(tick);
  };
  const stop = () => { if (timer.current) cancelAnimationFrame(timer.current); timer.current = null; setP(0); };
  return (
    <button onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onContextMenu={(e) => e.preventDefault()}
      className="relative overflow-hidden inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] bg-bad-bg text-bad border border-bad-line cursor-pointer select-none touch-none"
      title="Press and hold to delete this card (also stops its agent)">
      <span className="absolute inset-y-0 left-0 bg-[#fca5a5]" style={{ width: `${p * 100}%` }} />
      <span className="relative inline-flex items-center gap-1.5"><Trash2 className="size-3.5" /><span className={p > 0 ? '' : 'hidden sm:inline'}>{p > 0 ? 'Keep holding…' : 'Hold to delete'}</span></span>
    </button>
  );
}

function Particles() {
  const dots = Array.from({ length: 36 }, (_, i) => ({ i, x: (Math.random() - 0.5) * 900, y: (Math.random() - 0.5) * 600, s: 4 + Math.random() * 8 }));
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {dots.map((d) => (
        <motion.span key={d.i} className="absolute rounded-full bg-[#a1a1aa]" style={{ width: d.s, height: d.s }}
          initial={{ x: 0, y: 0, opacity: 0.9 }} animate={{ x: d.x, y: d.y, opacity: 0, scale: 0.3 }} transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }} />
      ))}
    </div>
  );
}

function Lightbox({ card, index, onClose }: { card: Card; index: number; onClose: () => void }) {
  const [i, setI] = useState(index);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'ArrowRight') setI((v) => Math.min(card.screenshots.length - 1, v + 1));
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [card, onClose]);
  const s = card.screenshots[i];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 cursor-zoom-out">
      <motion.img key={s?.id} src={s?.url} initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={motionTransitions.springSmooth}
        className="max-w-full max-h-full rounded-[14px] shadow-dialog bg-white" />
      {card.screenshots.length > 1 && <div className="absolute bottom-5 text-white/80 text-[12px]">{i + 1} / {card.screenshots.length} · ← →</div>}
    </motion.div>
  );
}

function AgentPanel({ card }: { card: Card }) {
  const me = useStore((s) => s.me);
  const lastModel = useStore((s) => s.lastModel);
  const models = useStore((s) => s.models);
  const st = useStore();
  const openStepId = useStore((s) => s.openStepId);
  const highlight = useStore((s) => s.highlight);
  const now = useNow(15000);
  const [model, setModel] = useState(card.agent?.model || lastModel || models[0]?.id || '');
  const [reply, setReply] = useState('');
  const a = card.agent;
  const active = agentActive(card);
  const drive = canDrive(me, card);
  const human = a?.driver === 'human';
  useEffect(() => { if (!model && models[0]) setModel(models[0].id); }, [models, model]);

  const stateLine = !a ? <span className="text-muted">no agent yet</span>
    : a.state === 'needs_help' ? <><Dot tone="warn" /><b className="text-warn-ink">needs help</b></>
    : human ? <><span>✋</span><b>{a.driverLogin} is driving</b></>
    : a.state === 'running' || a.state === 'starting' ? <><Dot pulse /><b>{a.state === 'starting' ? 'starting' : 'running'}</b></>
    : <><Dot tone="grey" /><b>{a.state}</b></>;

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      <div className="flex items-center gap-2 flex-wrap">
        <Label>Agent</Label>
        <span className="flex items-center gap-1.5">{stateLine}</span>
        {a?.startedAt && <span className="text-muted text-[11.5px]">{active ? 'for' : 'ran'} {since(a.startedAt, a.endedAt || now)}</span>}
        <div className="flex-1" />
        {(!active || !a) && drive && <ModelSelect value={model} onChange={setModel} align="right" />}
        {active && a && <Pill tone="white" size="sm">Model: {models.find((m) => m.id === a.model)?.label || a.model}</Pill>}
        {active && <Btn tone="white" size="sm" onClick={() => st.set({ liveCardId: card.id })}><Maximize2 className="size-3.5" />Full live view</Btn>}
        {active && drive && (human
          ? <Btn tone="dark" size="sm" onClick={() => st.handback(card.id)}>↩ Hand back</Btn>
          : <Btn tone="white" size="sm" onClick={() => { st.takeover(card.id); st.set({ liveCardId: card.id }); }}><Hand className="size-3.5" />Take over</Btn>)}
        {active && drive && <Btn tone="red" size="sm" onClick={() => st.stopAgent(card.id)}><Square className="size-3 fill-current" />Stop</Btn>}
        {!active && drive && (
          <Btn tone="dark" size="sm" disabled={!model} onClick={() => st.startAgent(card.id, model)}><Play className="size-3 fill-current" />{a ? 'Start again' : 'Start agent'}</Btn>
        )}
      </div>

      {!drive && !active && <div className="text-muted text-[12px]">Join this card to start an agent on it.</div>}

      {a?.state === 'needs_help' && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-[14px] bg-warn-bg border border-warn-line p-3 flex flex-col gap-2">
          <div className="text-warn-ink"><b>The agent asks:</b> {a.question || a.lastStep}</div>
          {drive && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (reply.trim()) { st.messageAgent(card.id, reply.trim()); setReply(''); } }}>
              <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Answer the agent…" className="flex-1 bg-white border border-warn-line rounded-full px-3 py-1.5 outline-none" />
              <Btn tone="dark" size="sm">Send</Btn>
            </form>
          )}
        </motion.div>
      )}

      <div className="flex gap-3.5 min-h-0 flex-col lg:flex-row flex-1">
        {(active || a) && (
          <div className="lg:flex-[1.25] min-w-0 flex flex-col border border-line rounded-[14px] overflow-hidden bg-white">
            <div className="h-[34px] bg-surface flex items-center gap-2 px-3 border-b border-line">
              <span className="flex gap-[5px]"><i className="size-[9px] rounded-full bg-[#d4d4d8]" /><i className="size-[9px] rounded-full bg-[#d4d4d8]" /><i className="size-[9px] rounded-full bg-[#d4d4d8]" /></span>
              <span className="flex-1 bg-white rounded-full px-3 py-[3px] text-[11px] text-muted font-mono truncate">{card.link.replace(/^https?:\/\//, '') || 'agent browser'}</span>
              {active && <span className="text-[10.5px] text-muted flex items-center gap-1"><Dot pulse />live</span>}
            </div>
            {active ? (
              <button className="relative aspect-[16/10] cursor-zoom-in" onClick={() => st.set({ liveCardId: card.id })} title="Open the full live view">
                <LiveImage cardId={card.id} fps={4} width={760} className="absolute inset-0" />
              </button>
            ) : (
              <div className="aspect-[16/10] flex items-center justify-center text-faint text-[12px]">The agent's browser shows here while it runs</div>
            )}
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col min-h-[180px]">
          <div className="flex items-center mb-1"><b className="text-[12px]">What it did</b><div className="flex-1" /><span className="text-[10.5px] text-muted">tool calls · searchable</span></div>
          {a ? <StepList cardId={card.id} running={a.state === 'running'} focusStepId={openStepId} highlight={highlight} className="flex-1 max-h-[340px]" autoScroll={!openStepId} />
            : <div className="text-faint text-[12px] py-3">Nothing yet. Start an agent, or work it by hand and type the answer below.</div>}
        </div>
      </div>
    </div>
  );
}

/** A tiny round initial that fills green when that person entered this answer. */
function EnteredDot({ login, done, isMe, onToggle }: { login: string; done: boolean; isMe: boolean; onToggle?: () => void }) {
  const users = useStore((s) => s.users);
  const color = userColor(users, login);
  return (
    <motion.button type="button" disabled={!isMe} onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
      animate={{ backgroundColor: done ? color : '#ffffff', color: done ? '#ffffff' : '#a1a1aa', borderColor: done ? color : '#e4e4e7' }}
      transition={motionTransitions.easeSoft}
      className={cn('size-[22px] rounded-full border text-[9.5px] font-bold flex items-center justify-center flex-none', isMe ? 'cursor-pointer ring-offset-1 hover:ring-2 hover:ring-line' : 'cursor-default')}
      title={`${login}${done ? ' entered it' : ' has not entered it yet'}${isMe ? (done ? ' · click to undo' : ' · click when you typed it in') : ''}`}>
      {login.slice(0, 2).toUpperCase()}
    </motion.button>
  );
}

function AnswerItem({ card, a, canEdit }: { card: Card; a: Answer; canEdit: boolean }) {
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me);
  const st = useStore();
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(a.value);
  const mine = !!(me && a.entered[me.login]);
  const n = users.filter((u) => a.entered[u.login]).length;
  return (
    <motion.div layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={motionTransitions.springSnappy} className="flex flex-col gap-1.5">
      {edit ? (
        <form className="flex gap-2 items-center py-1.5 pr-1.5 pl-3 rounded-[14px] border border-line bg-white"
          onSubmit={async (e) => { e.preventDefault(); if (val.trim()) { await st.patchAnswer(card.id, a.id, { value: val.trim() }); setEdit(false); } }}>
          {a.label && <span className="text-[11.5px] font-semibold text-muted">{a.label}</span>}
          <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEdit(false)}
            className="flex-1 min-w-0 font-mono font-bold text-[16px] outline-none tracking-[.3px]" />
          <Btn tone="ghost" size="sm" type="button" onClick={() => setEdit(false)}>Cancel</Btn>
          <Btn tone="dark" size="sm">Save</Btn>
        </form>
      ) : (
        <AnswerRow a={a} big>
          {canEdit && (
            <span className="flex items-center gap-0.5">
              <button onClick={() => { setVal(a.value); setEdit(true); }} className="text-[11px] text-muted hover:text-ink px-1.5 py-1 cursor-pointer" title="Edit this answer">Edit</button>
              <button onClick={() => st.deleteAnswer(card.id, a.id)} className="p-1 rounded-full text-faint hover:text-bad hover:bg-bad-bg cursor-pointer" title="Remove this answer"><X className="size-3.5" /></button>
            </span>
          )}
        </AnswerRow>
      )}
      <div className="flex items-center gap-1.5 pl-1">
        {me && (
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => st.setAnswerEntered(card.id, a.id, !mine)}
            className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full cursor-pointer whitespace-nowrap mr-1',
              mine ? 'bg-ok-bg text-ok-ink border border-ok-line' : 'bg-ink text-white hover:bg-[#27272a]')}>
            {mine ? '✓ You entered it' : "I've entered it"}
          </motion.button>
        )}
        <div className="flex -space-x-1">
          {users.map((u) => <EnteredDot key={u.login} login={u.login} done={!!a.entered[u.login]} isMe={u.login === me?.login} onToggle={() => st.setAnswerEntered(card.id, a.id, !a.entered[u.login])} />)}
        </div>
        <span className="text-[11px] text-muted ml-1.5">{n === users.length && n > 0 ? 'everyone ✓' : `${n} of ${users.length}`}</span>
      </div>
    </motion.div>
  );
}

function AnswerBox({ card }: { card: Card }) {
  const me = useStore((s) => s.me);
  const st = useStore();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [val, setVal] = useState('');
  const answers = card.answers ?? [];
  const canEdit = me?.role === 'owner' || isOnCard(me, card);
  const nextLabel = () => (answers.length && answers.every((x) => /^Q\d+$/i.test(x.label)) ? `Q${answers.length + 1}` : '');
  const save = async () => {
    if (!val.trim()) return;
    await st.addAnswer(card.id, label.trim(), val.trim());
    setVal(''); setLabel(nextLabel() && /^Q\d+$/i.test(label) ? `Q${Number(label.slice(1)) + 1}` : '');
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Label>{answers.length > 1 ? `Answers · ${answers.length}` : 'Answer'}</Label>
        <div className="flex-1" />
        {answers.length > 0 && !card.allAnswered && canEdit && (
          <Btn tone="white" size="xs" onClick={() => st.patchCard(card.id, { allAnswered: true })} title="Every question of this task has its answer">Mark all answered</Btn>
        )}
        {answers.length > 0 && card.allAnswered && <span className="text-[11px] text-ok-ink">all answered ✓</span>}
      </div>
      {answers.length === 0 && !adding && (
        <div className="flex items-center gap-3 p-3 pl-4 rounded-[16px] bg-[#fafafa] border border-dashed border-[#d4d4d8]">
          <span className="flex-1 font-mono font-bold text-[18px] text-faint">not found yet</span>
          <Btn tone="white" size="sm" onClick={() => { setLabel(''); setVal(''); setAdding(true); }}>Type it in</Btn>
        </div>
      )}
      <AnimatePresence initial={false}>
        {answers.map((a) => <AnswerItem key={a.id} card={card} a={a} canEdit={canEdit} />)}
      </AnimatePresence>
      {adding ? (
        <form className="flex gap-2 items-center p-1.5 pl-2 rounded-[14px] border border-line bg-white" onSubmit={async (e) => { e.preventDefault(); await save(); }}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Q1" className="w-14 text-[12.5px] font-semibold outline-none bg-surface rounded-full px-2.5 py-1 text-center" title="Label (optional), e.g. Q1" />
          <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} placeholder="WORD-0000"
            className="flex-1 min-w-0 font-mono font-bold text-[16px] outline-none tracking-[.3px]" />
          <Btn tone="ghost" size="sm" type="button" onClick={() => setAdding(false)}>Done</Btn>
          <Btn tone="dark" size="sm" disabled={!val.trim()}>Add</Btn>
        </form>
      ) : answers.length > 0 && (
        <button onClick={() => { setLabel(nextLabel()); setVal(''); setAdding(true); }} className="self-start text-[11.5px] text-info cursor-pointer hover:underline pl-1">+ Add answer</button>
      )}
    </div>
  );
}

export function CardDialog() {
  const openCardId = useStore((s) => s.openCardId);
  const card = useStore((s) => (s.openCardId ? s.cards[s.openCardId] : undefined));
  const me = useStore((s) => s.me);
  const st = useStore();
  const [shot, setShot] = useState<number | null>(null);
  const [dying, setDying] = useState(false);
  const [notes, setNotes] = useState('');
  const [editTitle, setEditTitle] = useState(false);
  const [editTask, setEditTask] = useState(false);
  const controls = useAnimationControls();
  const owner = me?.role === 'owner';
  const close = () => st.set({ openCardId: null, openStepId: null });

  useEffect(() => { setNotes(card?.notes || ''); setDying(false); setEditTitle(false); setEditTask(false); }, [openCardId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!openCardId) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && shot === null && !st.liveCardId && !st.searchOpen) close(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [openCardId, shot, st.liveCardId, st.searchOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDelete = async () => {
    if (!card) return;
    setDying(true);
    await controls.start({ scale: 0.92, opacity: 0, filter: 'blur(6px)', transition: { duration: 0.45 } });
    await st.deleteCard(card.id).catch(() => { setDying(false); controls.start({ scale: 1, opacity: 1, filter: 'blur(0px)' }); });
  };

  const colLabel = card ? (card.agent?.state === 'needs_help' ? 'Needs help' : card.column === 'todo' ? 'To do' : card.column === 'working' ? 'Working' : 'Done') : '';
  const tone = card?.agent?.state === 'needs_help' ? 'amber' : card?.column === 'done' ? 'soft' : card?.column === 'working' ? 'green' : 'soft';

  return (
    <AnimatePresence>
      {card && (
        <div className="fixed inset-0 z-40 flex items-center justify-center sm:p-6">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTransitions.easeSoft} onClick={close} className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" />
          {/* K: the card morphs into this dialog (shared layoutId) */}
          <motion.div
            layoutId={`card-${card.id}`}
            transition={motionTransitions.springMorph}
            className="relative w-full h-full sm:h-auto sm:max-h-[calc(100vh-80px)] sm:w-[min(1260px,calc(100vw-48px))] bg-white sm:rounded-[26px] shadow-dialog border border-line overflow-hidden flex flex-col"
          >
            <motion.div animate={controls} className="flex flex-col min-h-0 h-full">
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="flex items-center gap-2.5 px-5 sm:px-7 pt-5 sm:pt-6 pb-3">
                {editTitle && owner ? (
                  <input autoFocus defaultValue={card.title} onBlur={(e) => { setEditTitle(false); if (e.target.value.trim() && e.target.value !== card.title) st.patchCard(card.id, { title: e.target.value.trim() }); }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className="text-[24px] font-bold tracking-[-.5px] outline-none border-b border-line min-w-0 flex-1" />
                ) : (
                  <h2 onDoubleClick={() => owner && setEditTitle(true)} className="text-[20px] sm:text-[24px] font-bold tracking-[-.5px] m-0 truncate" title={owner ? 'Double-click to rename' : undefined}>{card.title}</h2>
                )}
                <Pill tone={tone as any} size="sm">{card.column === 'working' && card.agent?.state === 'running' && <Dot pulse />}{colLabel}</Pill>
                <div className="flex-1" />
                {owner && <HoldToDelete onConfirm={onDelete} />}
                <button onClick={close} className="p-2 rounded-full border border-line hover:bg-surface cursor-pointer" aria-label="Close"><X className="size-4" /></button>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className="flex-1 min-h-0 overflow-y-auto thin-scroll px-5 sm:px-7 pb-6">
                <div className="flex gap-6 flex-col lg:flex-row">
                  {/* left */}
                  <div className="lg:w-[440px] flex-none flex flex-col gap-3.5">
                    {card.screenshots.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <Label>Screenshots</Label>
                        <div className="grid grid-cols-2 gap-2.5">
                          {card.screenshots.map((s, i) => (
                            <button key={s.id} onClick={() => setShot(i)} className="h-[140px] rounded-[10px] border border-line overflow-hidden bg-[#fafafa] cursor-zoom-in hover:shadow-[0_4px_14px_#0000000f] transition-shadow">
                              <img src={s.url} alt={`screenshot ${i + 1}`} className="w-full h-full object-cover object-top" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <Label>The task</Label>
                      {editTask && owner ? (
                        <textarea autoFocus defaultValue={card.task} rows={6} onBlur={(e) => { setEditTask(false); if (e.target.value !== card.task) st.patchCard(card.id, { task: e.target.value }); }}
                          className="bg-surface rounded-[16px] px-3.5 py-3 outline-none resize-y" />
                      ) : (
                        <div onDoubleClick={() => owner && setEditTask(true)} className="bg-surface rounded-[16px] px-3.5 py-3 whitespace-pre-wrap">{card.task || <span className="text-faint">No instructions read yet.</span>}</div>
                      )}
                    </div>
                    {card.link && (
                      <div className="flex flex-col gap-1.5">
                        <Label>Link</Label>
                        <a href={card.link} target="_blank" rel="noreferrer noopener" className="border border-line rounded-[12px] px-3 py-2 font-mono text-[11.5px] flex items-center gap-2 hover:bg-[#fafafa]">
                          <span className="truncate flex-1">{card.link}</span><ExternalLink className="size-3.5 text-muted" />
                        </a>
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <Label>On it</Label>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {card.people.map((p) => <NameChip key={p} login={p} big />)}
                        {me && (card.people.includes(me.login)
                          ? <Btn tone="ghost" size="sm" onClick={() => st.leave(card.id)}>Leave</Btn>
                          : <Btn tone="ghost" size="sm" onClick={() => st.join(card.id)}>+ Join</Btn>)}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Notes</Label>
                      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== card.notes && st.patchCard(card.id, { notes })} rows={2}
                        placeholder="Anything the team should know…" className="border border-line rounded-[12px] px-3 py-2 outline-none resize-y focus:border-[#a1a1aa] placeholder:text-faint" />
                    </div>
                  </div>
                  {/* right */}
                  <div className="flex-1 min-w-0 flex flex-col gap-4">
                    <AgentPanel card={card} />
                    <AnswerBox card={card} />
                  </div>
                </div>
              </motion.div>
            </motion.div>
            {dying && <Particles />}
          </motion.div>
          <AnimatePresence>{shot !== null && <Lightbox card={card} index={shot} onClose={() => setShot(null)} />}</AnimatePresence>
        </div>
      )}
    </AnimatePresence>
  );
}
