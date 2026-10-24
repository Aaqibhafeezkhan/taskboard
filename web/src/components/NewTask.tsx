import { AnimatePresence, motion } from 'framer-motion';
import { ImagePlus, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../lib/utils.ts';
import { motionTransitions } from '../lib/motion-tokens.ts';
import { useStore } from '../state/store.ts';
import { Btn, Label } from './ui.tsx';

export const imageFiles = (list: DataTransferItemList | FileList | null | undefined): File[] => {
  if (!list) return [];
  const out: File[] = [];
  for (const it of Array.from(list as ArrayLike<DataTransferItem | File>)) {
    const f = it instanceof File ? it : it.kind === 'file' ? it.getAsFile() : null;
    if (f && f.type.startsWith('image/')) out.push(f);
  }
  return out;
};

/** Owner only: paste or drop screenshots, optionally type the fields, and the board reads the rest. */
export function NewTaskDialog() {
  const newTask = useStore((s) => s.newTask);
  const set = useStore((s) => s.set);
  const createTask = useStore((s) => s.createTask);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [task, setTask] = useState('');
  const [link, setLink] = useState('');
  const [read, setRead] = useState(true);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (newTask.open) { setFiles(newTask.files); setTitle(''); setTask(''); setLink(''); setRead(true); setBusy(false); }
  }, [newTask]);

  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const close = () => set({ newTask: { open: false, files: [] } });
  const add = (more: File[]) => more.length && setFiles((f) => [...f, ...more].slice(0, 12));

  useEffect(() => {
    if (!newTask.open) return;
    const onPaste = (e: ClipboardEvent) => {
      const imgs = imageFiles(e.clipboardData?.items);
      if (imgs.length) { e.preventDefault(); add(imgs); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('paste', onPaste); window.removeEventListener('keydown', onKey); };
  }, [newTask.open]);

  const canCreate = !busy && (files.length > 0 || title.trim() || task.trim());
  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    try {
      await createTask({ title, task, link }, files, read);
      close();
    } catch { setBusy(false); }
  };

  return (
    <AnimatePresence>
      {newTask.open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center sm:p-6">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={motionTransitions.springSmooth}
            className="relative w-full h-full sm:h-auto sm:max-h-[calc(100vh-80px)] sm:w-[min(720px,calc(100vw-48px))] bg-white sm:rounded-[26px] shadow-dialog border border-line overflow-hidden flex flex-col"
          >
            <div className="flex items-center gap-2.5 px-5 sm:px-7 pt-5 sm:pt-6 pb-3">
              <h2 className="text-[20px] sm:text-[24px] font-bold tracking-[-.5px] m-0">New task</h2>
              <div className="flex-1" />
              <button onClick={close} className="p-2 rounded-full border border-line hover:bg-surface cursor-pointer" aria-label="Close"><X className="size-4" /></button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto thin-scroll px-5 sm:px-7 pb-5 flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <Label>Screenshots</Label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                  onDragLeave={() => setOver(false)}
                  onDrop={(e) => { e.preventDefault(); setOver(false); add(imageFiles(e.dataTransfer.files)); }}
                  className={cn('rounded-[16px] border-[1.5px] border-dashed p-3 transition-colors', over ? 'border-[#93c5fd] bg-info-bg' : 'border-[#d4d4d8] bg-[#fafafa]')}
                >
                  {files.length === 0 ? (
                    <button onClick={() => input.current?.click()} className="w-full flex flex-col items-center justify-center gap-1.5 py-8 text-muted cursor-pointer">
                      <ImagePlus className="size-6" />
                      <span className="text-[13px] text-ink font-semibold">Paste screenshots here (⌘V)</span>
                      <span className="text-[11.5px]">or drop them, or click to pick files</span>
                    </button>
                  ) : (
                    <div className="flex gap-2.5 flex-wrap">
                      <AnimatePresence initial={false}>
                        {urls.map((u, i) => (
                          <motion.div key={u} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                            className="relative w-[150px] h-[96px] rounded-[10px] border border-line overflow-hidden bg-white">
                            <img src={u} alt="" className="w-full h-full object-cover object-top" />
                            <button onClick={() => setFiles((f) => f.filter((_, k) => k !== i))} aria-label="Remove"
                              className="absolute top-1 right-1 size-6 rounded-full bg-ink/70 text-white flex items-center justify-center cursor-pointer hover:bg-ink">
                              <X className="size-3.5" />
                            </button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      <button onClick={() => input.current?.click()} className="w-[96px] h-[96px] rounded-[10px] border border-line bg-white flex flex-col items-center justify-center gap-1 text-muted text-[11.5px] cursor-pointer hover:bg-surface">
                        <ImagePlus className="size-4" />add
                      </button>
                    </div>
                  )}
                  <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { add(imageFiles(e.target.files)); e.target.value = ''; }} />
                </div>
              </div>

              <label className={cn('flex items-center gap-2 text-[12.5px] select-none', files.length ? 'cursor-pointer' : 'opacity-50')}>
                <input type="checkbox" checked={read} disabled={!files.length} onChange={(e) => setRead(e.target.checked)} className="accent-[#0a0a0a]" />
                <Sparkles className="size-3.5" /> Read the screenshots and fill in whatever I leave empty
              </label>

              <div className="flex flex-col gap-1.5">
                <Label>Title</Label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={read && files.length ? 'Read from the screenshots' : 'Short title'}
                  className="border border-line rounded-[12px] px-3 py-2 outline-none focus:border-[#a1a1aa]" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>The task</Label>
                <textarea value={task} onChange={(e) => setTask(e.target.value)} rows={4} placeholder={read && files.length ? 'Read from the screenshots' : 'What has to be done, how the answer looks'}
                  className="border border-line rounded-[12px] px-3 py-2 outline-none focus:border-[#a1a1aa] resize-y" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Link</Label>
                <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…"
                  className="border border-line rounded-[12px] px-3 py-2 outline-none focus:border-[#a1a1aa] font-mono text-[12.5px]" />
              </div>
            </div>

            <div className="flex items-center gap-2 px-5 sm:px-7 py-4 border-t border-line">
              <span className="text-[11.5px] text-faint">Lands in To do</span>
              <div className="flex-1" />
              <Btn tone="ghost" onClick={close}>Cancel</Btn>
              <Btn tone="dark" onClick={create} disabled={!canCreate}>{busy ? 'Creating…' : 'Create task'}</Btn>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
