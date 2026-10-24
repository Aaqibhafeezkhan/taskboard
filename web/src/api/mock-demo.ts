// Mock-only: ?demo=<screen> opens a screen directly, for screenshots.
import { useStore } from '../state/store.ts';

export function applyDemo() {
  const p = new URLSearchParams(location.search);
  const demo = p.get('demo');
  const set = useStore.getState().set;
  const later = (f: () => void, ms = 400) => setTimeout(f, ms);
  if (demo === 'select') later(() => set({ selected: ['login-maze', 'broken-calc', 'photo-meta'] }));
  if (demo === 'dialog') later(() => set({ openCardId: p.get('card') || 'cookie-jar', highlight: p.get('q') || '' }));
  if (demo === 'wall') later(() => set({ view: 'wall' }));
  if (demo === 'live') later(() => set({ liveCardId: p.get('card') || 'cookie-jar' }));
  if (demo === 'search') later(() => {
    set({ searchOpen: true });
    later(() => {
      const el = document.querySelector('input[placeholder^="Search everything"]') as HTMLInputElement | null;
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, p.get('q') || 'reset link');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, 300);
  });
  if (demo === 'chat') later(() => set({ chatOpen: true }));
  if (demo === 'mention') later(() => {
    const ta = document.querySelector('textarea[placeholder^="Message the team"]') as HTMLTextAreaElement | null;
    if (!ta) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(ta, 'sure, @ju');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus(); ta.setSelectionRange(9, 9);
    ta.dispatchEvent(new Event('select', { bubbles: true }));
  }, 600);
}
