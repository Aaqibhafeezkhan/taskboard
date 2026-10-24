import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { Round } from '../../../shared/types.ts';
import { motionTransitions } from '../lib/motion-tokens.ts';
import { useStore } from '../state/store.ts';
import { Btn, Pill } from './ui.tsx';

/** Round name pill. The owner can click it to rename the round, switch practice/real and set the timer. */
export function RoundPill() {
  const round = useStore((s) => s.round);
  const me = useStore((s) => s.me);
  const api = useStore((s) => s.api);
  const set = useStore((s) => s.set);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(round.name);
  const [practice, setPractice] = useState(round.practice);
  const [mins, setMins] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const owner = me?.role === 'owner';

  useEffect(() => {
    if (!open) return;
    setName(round.name); setPractice(round.practice);
    setMins(round.endsAt ? String(Math.max(0, Math.round((round.endsAt - Date.now()) / 60000))) : '');
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const m = parseFloat(mins);
    const next: Round = { name: name.trim() || round.name, practice, endsAt: mins.trim() && m > 0 ? Date.now() + m * 60000 : null };
    const r = await api<Round>('PUT', 'api/round', next);
    set({ round: r });
    setOpen(false);
  };

  if (!owner) return <Pill className="hidden sm:inline-flex">{round.name}</Pill>;
  return (
    <div ref={ref} className="relative hidden sm:block">
      <Pill as="button" className="cursor-pointer hover:bg-surface2" onClick={() => setOpen((o) => !o)} title="Change the round and its timer">{round.name}</Pill>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.97 }} transition={motionTransitions.springSnappy}
            style={{ transformOrigin: 'left top' }} className="absolute left-0 top-full mt-2 z-50 w-72 bg-white border border-line rounded-[16px] shadow-pop p-3.5 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[11.5px] text-muted">Round name
              <input value={name} onChange={(e) => setName(e.target.value)} className="border border-line rounded-[10px] px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-[#a1a1aa]" />
            </label>
            <div className="inline-flex p-[3px] rounded-full bg-surface gap-0.5 self-start">
              {[true, false].map((p) => (
                <button key={String(p)} onClick={() => setPractice(p)} className={`relative px-3 py-1 rounded-full text-[12px] cursor-pointer ${practice === p ? 'text-ink' : 'text-muted'}`}>
                  {practice === p && <motion.span layoutId="round-seg" className="absolute inset-0 rounded-full bg-white shadow-[0_1px_3px_#00000014]" transition={motionTransitions.springSnappy} />}
                  <span className="relative">{p ? 'Practice' : 'Real'}</span>
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1 text-[11.5px] text-muted">Timer: minutes left (empty = no timer)
              <input value={mins} onChange={(e) => setMins(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="e.g. 180" className="border border-line rounded-[10px] px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-[#a1a1aa]" />
            </label>
            <div className="flex gap-2 justify-end">
              <Btn tone="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Btn>
              <Btn tone="dark" size="sm" onClick={save}>Save</Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
