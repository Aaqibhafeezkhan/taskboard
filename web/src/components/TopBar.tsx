import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, Search } from 'lucide-react';
import { useMemo } from 'react';
import { AnimatedNumber } from './easyui/AnimatedNumber.tsx';
import { MatrixTimer } from './MatrixTimer.tsx';
import { RoundPill } from './RoundPill.tsx';
import { Avatar, Kbd, Pill } from './ui.tsx';
import { motionTransitions } from '../lib/motion-tokens.ts';
import { useStore } from '../state/store.ts';

export function Logo() {
  return <span className="font-mono text-[15px] font-bold tracking-[-0.3px] whitespace-nowrap">▦ taskboard</span>;
}

export function TopBar() {
  const round = useStore((s) => s.round);
  const cards = useStore((s) => s.cards);
  const users = useStore((s) => s.users);
  const searchOpen = useStore((s) => s.searchOpen);
  const status = useStore((s) => s.status);
  const set = useStore((s) => s.set);
  const mentionedAt = useStore((s) => s.mentionedAt);
  const list = Object.values(cards);
  const answered = list.filter((c) => c.allAnswered || (!c.answers && c.answer)).length;
  const online = useMemo(() => users.filter((u) => u.online), [users]);

  return (
    <header className="h-16 flex-none flex items-center gap-2 px-3 sm:gap-3.5 sm:pl-12 sm:pr-6 border-b border-line bg-white relative z-20">
      <Logo />
      <RoundPill />
      {status !== 'open' && <Pill tone="amber" size="sm" className="hidden sm:inline-flex">reconnecting…</Pill>}
      <div className="flex-1" />
      {/* T: search pill expands into the palette (shared layout) */}
      {!searchOpen && (
        <motion.button
          layoutId="search-box"
          transition={motionTransitions.springMorph}
          onClick={() => set({ searchOpen: true })}
          className="hidden md:flex items-center gap-2 w-[420px] px-3.5 py-[9px] rounded-full bg-surface text-faint cursor-text hover:bg-surface2 transition-colors"
        >
          <Search className="size-3.5" />
          <span className="truncate">Search everything: cards, answers, agent steps…</span>
          <span className="flex-1" />
          <Kbd>⌘K</Kbd>
        </motion.button>
      )}
      {searchOpen && <div className="hidden md:block w-[420px]" />}
      <button onClick={() => set({ searchOpen: true })} className="md:hidden p-2 rounded-full bg-surface cursor-pointer" aria-label="Search"><Search className="size-4" /></button>
      <div className="flex-1 hidden md:block" />
      {round.endsAt && <MatrixTimer endsAt={round.endsAt} className="scale-[0.8] sm:scale-100 origin-right" />}
      <div className="hidden lg:flex flex-col gap-1">
        <span className="text-[11.5px] whitespace-nowrap">
          <AnimatedNumber value={answered} className="text-ink font-sans font-semibold" useGrouping={false} />
          <span className="text-muted"> of {list.length} answered</span>
        </span>
        <div className="w-[120px] h-1.5 rounded-full bg-surface2 overflow-hidden">
          <motion.div className="h-full bg-ok rounded-full" initial={false} animate={{ width: `${list.length ? (answered / list.length) * 100 : 0}%` }} transition={motionTransitions.springSmooth} />
        </div>
      </div>
      {/* B: people stack lifts on hover, new people slide in */}
      <div className="hidden sm:flex items-center pl-1">
        <AnimatePresence initial={false}>
          {online.map((u, i) => (
            <motion.span key={u.login} layout initial={{ opacity: 0, x: 8, scale: 0.6 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
              whileHover={{ y: -4, zIndex: 10 }} transition={motionTransitions.springSnappy} className="relative" style={{ marginLeft: i ? -7 : 0 }}>
              <Avatar login={u.login} />
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <button onClick={() => set({ chatOpen: true })} className={`xl:hidden relative p-2 rounded-full bg-surface cursor-pointer ${Date.now() - mentionedAt < 4000 ? 'mention-glow' : ''}`} aria-label="Team chat">
        <MessageCircle className="size-4" />
      </button>
    </header>
  );
}
