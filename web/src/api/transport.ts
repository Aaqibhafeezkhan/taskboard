import type { ClientMsg, LiveInput, ServerMsg } from '../../../shared/types.ts';

export interface LiveMeta { type: 'meta'; url?: string; width?: number; height?: number; driver?: 'agent' | 'human'; cursor?: { x: number; y: number; click?: boolean } }

export interface LiveHandlers {
  onFrame(frame: Blob): void;
  onMeta?(meta: LiveMeta): void;
  onStatus?(status: 'open' | 'closed'): void;
}

export interface LiveConn { send(input: LiveInput): void; close(): void }
export interface StateConn { send(msg: ClientMsg): void; close(): void }

export interface Transport {
  request<T>(method: string, path: string, body?: unknown): Promise<T>;
  connect(onMsg: (m: ServerMsg) => void, onStatus: (s: 'open' | 'closed') => void): StateConn;
  live(cardId: string, fps: number, width: number, h: LiveHandlers): LiveConn;
}

/** Directory of the current page, so the app works under any sub-path (e.g. /taskboard/). */
function baseDir(): string {
  const p = location.pathname;
  return p.endsWith('/') ? p : p.slice(0, p.lastIndexOf('/') + 1);
}

function wsUrl(path: string): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}${baseDir()}${path}`;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const realTransport: Transport = {
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
    if (body instanceof Blob) {
      init.body = body;
      (init.headers as Record<string, string>)['Content-Type'] = body.type || 'application/octet-stream';
    } else if (body !== undefined) {
      init.body = JSON.stringify(body);
      (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    }
    const r = await fetch(path, init); // relative to the page
    if (!r.ok) {
      let msg = `${r.status}`;
      try { const j = await r.json(); msg = j.error || j.message || msg; } catch { /* not json */ }
      throw new HttpError(r.status, msg);
    }
    const ct = r.headers.get('content-type') || '';
    return (ct.includes('json') ? r.json() : (undefined as unknown)) as T;
  },

  connect(onMsg, onStatus) {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let ping: ReturnType<typeof setInterval> | undefined;
    const open = () => {
      ws = new WebSocket(wsUrl('ws'));
      ws.onopen = () => {
        retry = 0; onStatus('open');
        ping = setInterval(() => ws?.readyState === 1 && ws.send(JSON.stringify({ type: 'ping' })), 25000);
      };
      ws.onmessage = (e) => { try { onMsg(JSON.parse(e.data)); } catch { /* ignore bad frame */ } };
      ws.onclose = () => {
        clearInterval(ping); onStatus('closed');
        if (!closed) setTimeout(open, Math.min(8000, 500 * 2 ** retry++));
      };
    };
    open();
    return {
      send: (m) => { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); },
      close: () => { closed = true; ws?.close(); },
    };
  },

  live(cardId, fps, width, h) {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    const open = () => {
      ws = new WebSocket(wsUrl(`ws/live?card=${encodeURIComponent(cardId)}&fps=${fps}&w=${Math.round(width)}`));
      ws.binaryType = 'blob';
      ws.onopen = () => { retry = 0; h.onStatus?.('open'); };
      ws.onmessage = (e) => {
        if (typeof e.data === 'string') { try { const m = JSON.parse(e.data); if (m.type === 'meta') h.onMeta?.(m); } catch { /* ignore */ } }
        else h.onFrame(e.data as Blob);
      };
      ws.onclose = () => {
        h.onStatus?.('closed');
        if (!closed) setTimeout(open, Math.min(8000, 700 * 2 ** retry++));
      };
    };
    open();
    return {
      send: (i) => { if (ws?.readyState === 1) ws.send(JSON.stringify(i)); },
      close: () => { closed = true; ws?.close(); },
    };
  },
};
