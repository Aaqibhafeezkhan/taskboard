import { AnimatePresence, motion } from 'framer-motion';
import { Board, BatchTray, Toolbar } from './components/Board.tsx';
import { CardDialog } from './components/CardDialog.tsx';
import { ChatPanel } from './components/Chat.tsx';
import { Confetti, Toasts } from './components/Effects.tsx';
import { LiveView, LiveWall } from './components/Live.tsx';
import { SearchPalette } from './components/Search.tsx';
import { imageFiles, NewTaskDialog } from './components/NewTask.tsx';
import { useEffect } from 'react';
import { Logo, TopBar } from './components/TopBar.tsx';
import { motionTransitions } from './lib/motion-tokens.ts';
import { useStore } from './state/store.ts';

function Loading() {
  const status = useStore((s) => s.status);
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}><Logo /></motion.div>
      <div className="text-muted text-[12px]">{status === 'closed' ? 'Can\'t reach the board, retrying…' : 'Loading the board…'}</div>
    </div>
  );
}

export default function App() {
  const me = useStore((s) => s.me);
  const view = useStore((s) => s.view);
  const chatOpen = useStore((s) => s.chatOpen);
  const set = useStore((s) => s.set);
  // owner: pasting screenshots anywhere on the board (outside text fields and dialogs) starts a new task
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const st = useStore.getState();
      if (st.me?.role !== 'owner' || st.newTask.open || st.openCardId || st.liveCardId || st.searchOpen) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return;
      const imgs = imageFiles(e.clipboardData?.items);
      if (imgs.length) { e.preventDefault(); st.set({ newTask: { open: true, files: imgs } }); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);
  if (!me) return <Loading />;
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <TopBar />
      <div className="flex-1 flex min-h-0">
        <main className="flex-1 min-w-0 flex flex-col">
          <Toolbar />
          {view === 'board' ? <Board /> : <LiveWall />}
        </main>
        <div className="hidden xl:flex"><ChatPanel /></div>
      </div>
      <AnimatePresence>
        {chatOpen && (
          <div className="xl:hidden fixed inset-0 z-[45]">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-ink/20" onClick={() => set({ chatOpen: false })} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={motionTransitions.springSmooth}
              className="absolute right-0 top-0 bottom-0 w-full sm:w-[392px] shadow-dialog">
              <ChatPanel drawer />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <BatchTray />
      <CardDialog />
      <NewTaskDialog />
      <LiveView />
      <SearchPalette />
      <Confetti />
      <Toasts />
    </div>
  );
}
