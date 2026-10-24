import { AnimatePresence, motion } from 'framer-motion';
import { Search as SearchIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SearchHit } from '../../../shared/types.ts';
import { cn } from '../lib/utils.ts';
import { motionTransitions } from '../lib/motion-tokens.ts';
import { useStore } from '../state/store.ts';
import { Dot, Kbd, Pill, Snippet } from './ui.tsx';

const colName = { todo: 'To do', working: 'Working', done: 'Done' } as const;

export function SearchPalette() {
  const open = useStore((s) => s.searchOpen);
  const set = useStore((s) => s.set);
  const search = useStore((s) => s.search);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [sel, setSel] = useState(0);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  // ⌘K / Ctrl-K / "/" opens it from anywhere
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.('input,textarea,[contenteditable=true]');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); set({ searchOpen: !useStore.getState().searchOpen }); }
      else if (e.key === '/' && !typing && !useStore.getState().searchOpen) { e.preventDefault(); set({ searchOpen: true }); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [set]);

  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 30); }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setHits([]); setLoading(false); return; }
    setLoading(true);
    const n = ++seq.current;
    const t = setTimeout(async () => {
      try { const r = await search(term); if (n === seq.current) { setHits(r); setSel(0); } }
      catch { if (n === seq.current) setHits([]); }
      finally { if (n === seq.current) setLoading(false); }
    }, 160);
    return () => clearTimeout(t);
  }, [q, search]);

  const close = () => set({ searchOpen: false });
  const go = (h: SearchHit, stepId?: number) => {
    const step = stepId ?? h.matches.find((m) => m.stepId)?.stepId ?? null;
    set({ searchOpen: false, openCardId: h.cardId, openStepId: step, highlight: q.trim(), liveCardId: null });
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex justify-center items-start pt-[10vh] px-3">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" />
          {/* T: the top-bar pill expands into this palette */}
          <motion.div layoutId="search-box" transition={motionTransitions.springMorph}
            className="relative w-full max-w-[700px] bg-white rounded-[26px] shadow-dialog border border-line p-2.5 flex flex-col max-h-[75vh]">
            <div className="flex items-center gap-2.5 px-3 py-2.5 text-[16px]">
              <SearchIcon className="size-4 text-muted" />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything: cards, answers, agent steps…"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { e.preventDefault(); close(); }
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(hits.length - 1, s + 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
                  if (e.key === 'Enter' && hits[sel]) { e.preventDefault(); go(hits[sel]); }
                }}
                className="flex-1 outline-none bg-transparent placeholder:text-faint" />
              {loading && <motion.span className="size-3.5 rounded-full border-2 border-line border-t-ink" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }} />}
              <Kbd>esc</Kbd>
            </div>
            <div className="h-px bg-line mx-1 mt-1 mb-2" />
            <div className="overflow-y-auto thin-scroll">
              {q.trim() && (
                <div className="text-[10.5px] text-faint px-3 pb-1.5">{hits.length} card{hits.length === 1 ? '' : 's'}</div>
              )}
              <div className="flex flex-col gap-1">
                {hits.map((h, i) => (
                  <div key={h.cardId} onMouseEnter={() => setSel(i)} onClick={() => go(h)} className="relative rounded-[14px] px-3 py-2.5 cursor-pointer">
                    {/* U: highlight glides between results */}
                    {sel === i && <motion.span layoutId="search-hl" transition={motionTransitions.springSnappy} className="absolute inset-0 bg-surface rounded-[14px]" />}
                    <div className="relative">
                      <div className="flex items-center gap-2">
                        <b>{h.title}</b>
                        {h.agentState === 'running' ? <Pill tone="green" size="xs"><Dot pulse />Working</Pill>
                          : h.agentState === 'needs_help' ? <Pill tone="amber" size="xs">Needs help</Pill>
                          : <Pill size="xs">{colName[h.column]}</Pill>}
                        <div className="flex-1" />
                        {sel === i && <Kbd>↵ open</Kbd>}
                      </div>
                      <div className="mt-1.5 flex flex-col gap-0.5">
                        {h.matches.map((m, j) => (
                          <button key={j} onClick={(e) => { e.stopPropagation(); go(h, m.stepId); }} className={cn('text-left text-[12px] rounded-[6px] cursor-pointer', m.stepId && 'hover:underline')}>
                            <span className="text-faint">{m.where} · </span><Snippet html={m.snippet} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {q.trim() && !loading && !hits.length && <div className="text-muted text-center py-8">Nothing found for “{q.trim()}”</div>}
              {!q.trim() && <div className="text-faint text-center py-6 text-[12px]">Type to search.</div>}
            </div>
            <div className="text-[10.5px] text-faint px-3 pt-2.5 pb-1">searches: title, task text, screenshots (read text), link, notes, answer, who's on it, chat, every agent step and thought</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
