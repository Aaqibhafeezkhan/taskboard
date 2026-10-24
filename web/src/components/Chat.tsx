import { AnimatePresence, motion } from 'framer-motion';
import { ImagePlus, Send, X } from 'lucide-react';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ChatMsg } from '../../../shared/types.ts';
import { cn } from '../lib/utils.ts';
import { motionTransitions } from '../lib/motion-tokens.ts';
import { useStore } from '../state/store.ts';
import { ThinkingOrb } from './easyui/ThinkingOrb.tsx';
import { Avatar, BotAvatar, CopyButton, Dot, Pill } from './ui.tsx';
import { imageFiles } from './NewTask.tsx';

function timeAgo(at: number, now: number) {
  const s = Math.floor((now - at) / 1000);
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  return new Date(at).toTimeString().slice(0, 5);
}

/** Text with @mentions and card names highlighted (G). */
function RichText({ text, cardTitles }: { text: string; cardTitles: string[] }) {
  const me = useStore((s) => s.me);
  const set = useStore((s) => s.set);
  const cards = useStore((s) => s.cards);
  const titles = cardTitles.filter((t) => t.length > 3).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(@[\\w-]+${titles.length ? '|' + titles.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') : ''})`, 'g');
  return (
    <>
      {text.split(re).map((p, i) => {
        if (p.startsWith('@')) {
          const isMe = me && p.slice(1).toLowerCase() === me.login.toLowerCase();
          return <motion.span key={i} initial={{ scale: 0.85, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} transition={motionTransitions.springSnappy}
            className={cn('inline-block rounded-[5px] px-[3px] font-medium', isMe ? 'bg-info text-white' : 'bg-info-bg text-info')}>{p}</motion.span>;
        }
        const card = Object.values(cards).find((c) => c.title === p);
        if (card) return <button key={i} onClick={() => set({ openCardId: card.id, openStepId: null })} className="text-[11.5px] font-semibold bg-surface rounded-[6px] px-1.5 py-px cursor-pointer hover:bg-surface2">{p}</button>;
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </>
  );
}

function Reaction({ msg, id, label, onClick }: { msg: ChatMsg; id: string; label: string; onClick: () => void }) {
  const me = useStore((s) => s.me);
  const list = msg.reactions[id] || [];
  const on = !!me && list.includes(me.login);
  return (
    <motion.button whileTap={{ scale: 0.92 }} onClick={onClick}
      className={cn('inline-flex items-center gap-[5px] px-2.5 py-1 rounded-full border text-[11.5px] cursor-pointer', on ? 'bg-info-bg border-[#bfdbfe] text-[#1d4ed8]' : 'bg-white border-line hover:bg-surface')}>
      {label}
      {list.length > 0 && (
        <AnimatePresence mode="popLayout" initial={false}>
          {/* H: count rolls and the chip bounces once */}
          <motion.span key={list.length} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={motionTransitions.springResponsive}>· {list.length}</motion.span>
        </AnimatePresence>
      )}
    </motion.button>
  );
}

function Message({ msg, now }: { msg: ChatMsg; now: number }) {
  const users = useStore((s) => s.users);
  const cards = useStore((s) => s.cards);
  const react = useStore((s) => s.react);
  const titles = useMemo(() => Object.values(cards).map((c) => c.title), [cards]);
  const bot = msg.author === 'board';
  const card = msg.cardId ? cards[msg.cardId] : undefined;
  const ans = msg.answerId ? card?.answers?.find((a) => a.id === msg.answerId) : undefined;
  const enteredMap = ans ? ans.entered : card?.entered ?? {};
  const missing = msg.kind === 'answer' && card ? users.filter((u) => !enteredMap[u.login]).map((u) => u.login) : [];
  return (
    <motion.div layout="position" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={motionTransitions.springSmooth} className="flex gap-2.5">
      {bot ? <BotAvatar /> : <Avatar login={msg.author} size={28} ring={false} />}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold flex gap-1.5 items-baseline">
          {bot ? 'Board agent' : msg.author}<span className="font-normal text-faint text-[11px]">{timeAgo(msg.at, now)}</span>
        </div>
        {msg.text && <div className="mt-0.5 break-words"><RichText text={msg.text} cardTitles={titles} /></div>}
        {!!msg.images?.length && (
          <div className="mt-1.5 flex gap-1.5 flex-wrap">
            {msg.images.map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" className="block w-[120px] h-[78px] rounded-[10px] border border-line overflow-hidden bg-[#fafafa] hover:opacity-90">
                <img src={u} alt="" loading="lazy" className="w-full h-full object-cover object-top" />
              </a>
            ))}
          </div>
        )}
        {msg.kind === 'answer' && (
          <div className="mt-1.5 border border-line rounded-[14px] p-2.5 bg-[#fafafa] flex flex-col gap-2">
            <div className="flex items-center gap-2 py-[7px] pr-[7px] pl-[11px] rounded-[12px] bg-ok-bg border border-ok-line">
              {msg.answerLabel && <span className="flex-none text-[10.5px] font-semibold text-[#047857] bg-white border border-ok-line rounded-full px-1.5 py-px">{msg.answerLabel}</span>}
              <span className="flex-1 font-mono font-bold text-[13.5px] text-[#065f46] tracking-[.3px] truncate">{msg.answer}</span>
              <CopyButton text={msg.answer || ''} />
            </div>
            {missing.length > 0
              ? <div className="text-[11.5px] text-muted">Still missing: <RichText text={missing.map((m) => '@' + m).join(' ')} cardTitles={[]} /></div>
              : <div className="text-[11.5px] text-ok-ink">Everyone entered it ✓</div>}
            <div className="flex gap-2 flex-wrap">
              <Reaction msg={msg} id="entered" label="👍 Entered" onClick={() => react(msg.id, 'entered')} />
              <Reaction msg={msg} id="had_it" label="Already had it" onClick={() => react(msg.id, 'had_it')} />
            </div>
          </div>
        )}
        {msg.kind === 'text' && Object.keys(msg.reactions).some((k) => msg.reactions[k]?.length) && (
          <div className="flex gap-1.5 mt-1 flex-wrap">
            {Object.entries(msg.reactions).filter(([, l]) => l.length).map(([k]) => <Reaction key={k} msg={msg} id={k} label={k} onClick={() => react(msg.id, k)} />)}
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface Opt { kind: 'person' | 'agent'; login: string; hint: string }

function Composer() {
  const users = useStore((s) => s.users);
  const cards = useStore((s) => s.cards);
  const me = useStore((s) => s.me);
  const sendChat = useStore((s) => s.sendChat);
  const conn = useStore((s) => s.conn);
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [imgs, setImgs] = useState<{ file: File; url: string }[]>([]);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadImage = useStore((s) => s.uploadImage);
  const addImgs = (files: File[]) => files.length && setImgs((l) => [...l, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, 12));
  const ta = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);

  const token = useMemo(() => {
    const before = text.slice(0, caret);
    const m = /(^|\s)@([\w-]*)$/.exec(before);
    return m ? { q: m[2].toLowerCase(), start: before.length - m[2].length - 1 } : null;
  }, [text, caret]);

  const opts: Opt[] = useMemo(() => {
    if (!token) return [];
    const onCard = (login: string) => Object.values(cards).find((c) => c.people.includes(login) && c.column !== 'done')?.title;
    const people: Opt[] = users.filter((u) => u.login !== me?.login).map((u) => ({ kind: 'person', login: u.login, hint: onCard(u.login) ? `on ${onCard(u.login)}` : u.online ? 'online' : 'away' }));
    const all: Opt[] = [...people, { kind: 'agent', login: 'board', hint: 'knows the whole board' }];
    return all.filter((o) => o.login.toLowerCase().startsWith(token.q) || o.login.toLowerCase().includes(token.q));
  }, [token, users, cards, me]);

  useEffect(() => setSel(0), [token?.q]);

  const pick = (o: Opt) => {
    if (!token) return;
    const next = text.slice(0, token.start) + '@' + o.login + ' ' + text.slice(caret);
    setText(next);
    const pos = token.start + o.login.length + 2;
    requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(pos, pos); setCaret(pos); });
  };

  const send = async () => {
    const t = text.trim();
    if ((!t && !imgs.length) || busy) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const i of imgs) urls.push(await uploadImage(i.file));
      await sendChat(t, undefined, urls);
      setText(''); setCaret(0);
      imgs.forEach((i) => URL.revokeObjectURL(i.url)); setImgs([]);
    } finally { setBusy(false); }
  };

  useLayoutEffect(() => {
    const el = ta.current; if (!el) return;
    el.style.height = '0px'; el.style.height = Math.min(120, el.scrollHeight) + 'px';
  }, [text]);

  return (
    <div
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); addImgs(imageFiles(e.dataTransfer.files)); }}
      className={cn('mx-3.5 mb-3.5 border rounded-[18px] px-3 py-2.5 relative bg-white shadow-[0_2px_10px_#0000000d] transition-colors', over ? 'border-[#93c5fd]' : 'border-line')}>
      {imgs.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-2">
          {imgs.map((i, k) => (
            <motion.div key={i.url} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative w-[64px] h-[48px] rounded-[8px] border border-line overflow-hidden">
              <img src={i.url} alt="" className="w-full h-full object-cover object-top" />
              <button onClick={() => { URL.revokeObjectURL(i.url); setImgs((l) => l.filter((_, j) => j !== k)); }} aria-label="Remove image"
                className="absolute top-0.5 right-0.5 size-4 rounded-full bg-ink/70 text-white flex items-center justify-center cursor-pointer"><X className="size-2.5" /></button>
            </motion.div>
          ))}
        </div>
      )}
      <AnimatePresence>
        {token && opts.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.97 }} transition={motionTransitions.springSnappy}
            style={{ transformOrigin: 'left bottom' }}
            className="absolute left-2.5 bottom-[calc(100%-6px)] w-[270px] bg-white border border-line rounded-[14px] shadow-pop p-1.5 z-10">
            {(['person', 'agent'] as const).map((k) => opts.some((o) => o.kind === k) && (
              <div key={k}>
                <div className="text-[10.5px] text-faint px-2 pt-1 pb-0.5">{k === 'person' ? 'People' : 'Agents'}</div>
                {opts.map((o, i) => o.kind === k && (
                  <button key={o.login} onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setSel(i)}
                    className="relative w-full flex items-center gap-2 px-2 py-[7px] rounded-[9px] text-[12.5px] text-left cursor-pointer">
                    {sel === i && <motion.span layoutId="mention-hl" transition={motionTransitions.springSnappy} className="absolute inset-0 bg-surface rounded-[9px]" />}
                    <span className="relative flex items-center gap-2 min-w-0">
                      {o.kind === 'agent' ? <BotAvatar size={22} /> : <Avatar login={o.login} size={22} ring={false} />}
                      <b className={cn(sel === i ? 'font-semibold' : 'font-normal')}>{o.login}</b>
                      <span className="text-faint text-[11.5px] truncate">{o.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <textarea
        ref={ta}
        rows={1}
        value={text}
        placeholder="Message the team… (@ to mention)"
        onChange={(e) => {
          setText(e.target.value); setCaret(e.target.selectionStart);
          const t = Date.now(); if (t - lastTyping.current > 2500) { lastTyping.current = t; conn?.send({ type: 'typing' }); }
        }}
        onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
        onPaste={(e) => { const f = imageFiles(e.clipboardData.items); if (f.length) { e.preventDefault(); addImgs(f); } }}
        onKeyDown={(e) => {
          if (token && opts.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % opts.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s - 1 + opts.length) % opts.length); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(opts[sel]); return; }
            if (e.key === 'Escape') { setCaret(-1); return; }
          }
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        }}
        className="w-full resize-none outline-none bg-transparent text-[13px] leading-[1.45] placeholder:text-faint"
      />
      <div className="flex items-center mt-1.5">
        <button onClick={() => fileInput.current?.click()} className="mr-2 p-1 -ml-1 rounded-full text-muted hover:text-ink hover:bg-surface cursor-pointer" aria-label="Attach images" title="Attach images (or paste / drop them)">
          <ImagePlus className="size-4" />
        </button>
        <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { addImgs(imageFiles(e.target.files)); e.target.value = ''; }} />
        <span className="text-faint text-[11.5px]">@ to mention · paste images · Enter to send</span>
        <div className="flex-1" />
        <motion.button whileTap={{ scale: 0.94 }} onClick={send} disabled={(!text.trim() && !imgs.length) || busy}
          className="inline-flex items-center gap-1.5 bg-ink text-white font-semibold rounded-full px-3 py-[5px] text-[12.5px] cursor-pointer disabled:opacity-40">
          <Send className="size-3" /> Send
        </motion.button>
      </div>
    </div>
  );
}

export function ChatPanel({ drawer }: { drawer?: boolean }) {
  const chat = useStore((s) => s.chat);
  const typing = useStore((s) => s.typing);
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me);
  const mentionedAt = useStore((s) => s.mentionedAt);
  const set = useStore((s) => s.set);
  const feed = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);
  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' }); }, [chat.length]);
  const botTyping = now - (typing['board'] || 0) < 8000 || Date.now() - (typing['board'] || 0) < 8000;
  const typers = Object.entries(typing).filter(([l, t]) => l !== 'board' && l !== me?.login && Date.now() - t < 4000).map(([l]) => l);
  const glow = Date.now() - mentionedAt < 4000;

  return (
    <aside className={cn('flex flex-col bg-white min-h-0', drawer ? 'h-full' : 'w-[392px] border-l border-line', glow && 'mention-glow')}>
      <div className="px-[18px] pt-3.5 pb-3 border-b border-line flex items-center gap-2">
        <b className="text-[14px]">Team chat</b>
        <div className="flex-1" />
        <Pill tone="green" size="xs" className="py-1 px-2.5"><Dot pulse />Board agent watching</Pill>
        {drawer && <button onClick={() => set({ chatOpen: false })} className="p-1.5 rounded-full hover:bg-surface cursor-pointer" aria-label="Close chat"><X className="size-4" /></button>}
      </div>
      <div ref={feed} className="flex-1 overflow-y-auto thin-scroll px-[18px] py-3.5 flex flex-col gap-3.5">
        {chat.length === 0 && <div className="text-faint text-center mt-8">No messages yet. Say hi 👋</div>}
        {chat.map((m) => <Message key={m.id} msg={m} now={now} />)}
        <AnimatePresence>
          {botTyping && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2.5 text-faint text-[12px]">
              {/* I: board agent shows a thinking orb while it writes */}
              <ThinkingOrb state="composing" size={28} />
              Board agent is writing…
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {typers.length > 0 && <div className="px-5 pb-1 text-[11px] text-faint">{typers.join(', ')} {typers.length > 1 ? 'are' : 'is'} typing…</div>}
      <Composer />
      {users.length === 0 && null}
    </aside>
  );
}
