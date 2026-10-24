import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { realTransport, type Transport } from './api/transport.ts';
import { useStore } from './state/store.ts';

async function boot() {
  let transport: Transport = realTransport;
  // Mock backend only exists in builds made with VITE_MOCK=1 (the branch and its chunk are dropped otherwise).
  if (import.meta.env.VITE_MOCK === '1') transport = (await import('./api/mock.ts')).mockTransport;
  useStore.getState().init(transport);
  if (import.meta.env.VITE_MOCK === '1') (await import('./api/mock-demo.ts')).applyDemo();
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
}
boot();
