import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Copy } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import type { ModelOption } from '../../../shared/types.ts';
import { cn, copyToClipboard } from '../lib/utils.ts';
import { motionTransitions } from '../lib/motion-tokens.ts';
import { shade, tint, useStore, userColor } from '../state/store.ts';

export function Pill({ className, children, tone = 'soft', size = 'md', as = 'span', ...p }: React.HTMLAttributes<HTMLElement> & {
  tone?: 'soft' | 'white' | 'dark' | 'ghost' | 'red' | 'green' | 'amber' | 'blue'; size?: 'xs' | 'sm' | 'md'; as?: 'span' | 'button';
}) {
  const tones = {
    soft: 'bg-surface text-ink',
    white: 'bg-white border border-line shadow-[0_1px_2px_#0000000a] hover:bg-[#fafafa]',
    dark: 'bg-ink text-white font-semibold hover:bg-[#27272a]',
    ghost: 'border border-line hover:bg-surface',
    red: 'bg-bad-bg text-bad border border-bad-line hover:bg-[#fee2e2]',
    green: 'bg-ok-bg text-ok-ink border border-ok-line',
    amber: 'bg-warn-bg text-warn-ink border border-warn-line',
    blue: 'bg-info-bg text-[#1d4ed8] border border-[#bfdbfe]',
  };
  const sizes = { xs: 'px-2 py-0.5 text-[10.5px]', sm: 'px-3 py-1 text-[11.5px]', md: 'px-3.5 py-1.5 text-[12.5px]' };
  const Comp = as as any;
  return (
    <Comp
      className={cn('inline-flex items-center gap-1.5 rounded-full whitespace-nowrap select-none transition-colors',
        as === 'button' && 'cursor-pointer active:scale-[0.97] transition-transform disabled:opacity-50 disabled:cursor-not-allowed',
        tones[tone], sizes[size], className)}
      {...p}
    >
      {children}
    </Comp>
  );
}

export const Btn = (p: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: React.ComponentProps<typeof Pill>['tone']; size?: 'xs' | 'sm' | 'md' }) => (
  <Pill as="button" {...(p as any)} />
);

export function Dot({ tone = 'ok', pulse, className }: { tone?: 'ok' | 'warn' | 'grey' | 'white'; pulse?: boolean; className?: string }) {
  const c = { ok: 'bg-ok', warn: 'bg-warn', grey: 'bg-faint', white: 'bg-white' }[tone];
  return <span className={cn('inline-block size-[7px] rounded-full flex-none', c, pulse && 'live-dot', className)} />;
}

export const Kbd = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[10.5px] px-1.5 py-px rounded-[5px] border border-line text-muted bg-white font-sans">{children}</span>
);

export function NameChip({ login, label, className, big }: { login: string; label?: string; className?: string; big?: boolean }) {
  const users = useStore((s) => s.users);
  const color = userColor(users, login);
  return (
    <span
      className={cn('inline-flex items-center gap-[5px] rounded-full font-semibold whitespace-nowrap', big ? 'text-[12.5px] px-2.5 py-1' : 'text-[11.5px] pl-1.5 pr-2 py-0.5', className)}
      style={{ background: tint(color, 0.16), color: shade(color, 0.5) }}
      title={login}
    >
      <i className="inline-block size-1.5 rounded-full" style={{ background: color }} />
      {label ?? login}
    </span>
  );
}

export function Avatar({ login, size = 24, ring = true }: { login: string; size?: number; ring?: boolean }) {
  const users = useStore((s) => s.users);
  return (
    <span
      className={cn('inline-flex items-center justify-center rounded-full font-bold text-white flex-none uppercase', ring && 'border-2 border-white')}
      style={{ width: size, height: size, background: userColor(users, login), fontSize: size * 0.38 }}
      title={login}
    >
      {login.replace(/[^a-z0-9]/gi, '').slice(0, 2)}
    </span>
  );
}

export const BotAvatar = ({ size = 28 }: { size?: number }) => (
  <span className="inline-flex items-center justify-center bg-ink text-white flex-none" style={{ width: size, height: size, borderRadius: size * 0.32, fontSize: size * 0.46 }}>✦</span>
);

/** Copy button that morphs into "✓ Copied" (animation D). */
export function CopyButton({ text, className, label = 'Copy', onCopied }: { text: string; className?: string; label?: string; onCopied?: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <motion.button
      layout
      transition={motionTransitions.springSnappy}
      whileTap={{ scale: 0.92 }}
      onClick={(e) => {
        e.stopPropagation();
        copyToClipboard(text).then(() => { setDone(true); onCopied?.(); setTimeout(() => setDone(false), 1800); });
      }}
      className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white border border-ok-line text-ok-ink cursor-pointer whitespace-nowrap', className)}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={done ? 'y' : 'n'} initial={{ opacity: 0, y: 6, filter: 'blur(2px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -6 }} transition={motionTransitions.easeFast} className="inline-flex items-center gap-1">
          {done ? <><Check className="size-3" strokeWidth={3} />Copied</> : <><Copy className="size-3" />{label}</>}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

/** Model picker grouped Claude / ChatGPT with a spring popover. */
export function ModelSelect({ value, onChange, dark, className, align = 'left', up }: { value: string; onChange: (id: string) => void; dark?: boolean; className?: string; align?: 'left' | 'right'; up?: boolean }) {
  const models = useStore((s) => s.models);
  const notes = useStore((s) => s.modelNotes);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);
  const cur = models.find((m) => m.id === value);
  // grouped by provider/account ("Claude · Work account"), in the server's order
  const groups: [string, ModelOption[]][] = [];
  for (const m of models) {
    const g = m.group || m.provider;
    const hit = groups.find(([k]) => k === g);
    if (hit) hit[1].push(m); else groups.push([g, [m]]);
  }
  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] cursor-pointer whitespace-nowrap',
          dark ? 'bg-[#27272a] text-white hover:bg-[#3f3f46]' : 'bg-white border border-line shadow-[0_1px_2px_#0000000a] hover:bg-[#fafafa]')}
      >
        <span className={dark ? 'text-[#a1a1aa]' : 'text-muted'}>Model:</span> {cur?.label || 'pick one'}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={motionTransitions.springSnappy}><ChevronDown className="size-3.5" /></motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: up ? 6 : -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: up ? 4 : -4 }}
            transition={motionTransitions.springSnappy}
            style={{ transformOrigin: `${align === 'left' ? 'left' : 'right'} ${up ? 'bottom' : 'top'}` }}
            className={cn('absolute z-50 w-64 max-h-[60vh] overflow-y-auto thin-scroll bg-white text-ink border border-line rounded-[14px] shadow-pop p-1.5', align === 'left' ? 'left-0' : 'right-0', up ? 'bottom-full mb-2' : 'top-full mt-2')}
            onClick={(e) => e.stopPropagation()}
          >
            {groups.map(([g, list]) => list.length > 0 && (
              <div key={g}>
                <div className="text-[10.5px] text-faint px-2.5 pt-1.5 pb-1 font-medium">{g}</div>
                {list.map((m) => (
                  <button key={m.id} onClick={() => { onChange(m.id); setOpen(false); }}
                    className={cn('w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[9px] text-[12.5px] text-left cursor-pointer hover:bg-surface', m.id === value && 'bg-surface font-semibold')}>
                    {m.label}{m.id === value && <Check className="size-3.5" />}
                  </button>
                ))}
              </div>
            ))}
            {!models.length && <div className="px-2.5 py-2 text-muted">No models available</div>}
            {notes.length > 0 && (
              <div className="mt-1 border-t border-line px-2.5 pt-2 pb-1 flex flex-col gap-1">
                {notes.map((n) => <div key={n} className="text-[10.5px] leading-snug text-faint">{n}</div>)}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('text-[10.5px] uppercase tracking-[.7px] text-faint font-semibold', className)}>{children}</div>;
}

/** Renders server snippets safely: only <mark> survives. */
export function Snippet({ html, className }: { html: string; className?: string }) {
  const parts = html.split(/(<mark>.*?<\/mark>)/g);
  const un = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/<[^>]*>/g, '');
  return (
    <span className={className}>
      {parts.map((p, i) => p.startsWith('<mark>') ? <mark key={i}>{un(p.slice(6, -7))}</mark> : <React.Fragment key={i}>{un(p)}</React.Fragment>)}
    </span>
  );
}

/** Highlights a plain-text query inside plain text. */
export function Highlight({ text, q }: { text: string; q: string }) {
  if (!q.trim()) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}
