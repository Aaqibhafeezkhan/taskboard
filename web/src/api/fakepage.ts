// Mock-only: draws a believable fake web page on a canvas (for mock screenshots and the mock live view).
export type PageKind = 'login' | 'text' | 'tiles' | 'account' | 'docs';

export interface PageOpts {
  title?: string;
  typed?: string;
  cursor?: { x: number; y: number; click?: number }; // normalised; click = ms timestamp of last click
  t?: number;
}

const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

export function drawPage(ctx: CanvasRenderingContext2D, kind: PageKind, W: number, H: number, o: PageOpts = {}) {
  const s = W / 1280;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  // nav
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, W, 64 * s);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${22 * s}px Inter, sans-serif`;
  ctx.textBaseline = 'middle';
  const brand = kind === 'docs' ? 'MirrorAPI' : kind === 'text' ? 'Task 07' : kind === 'tiles' ? 'Gallery' : 'PlayShop';
  ctx.fillText(brand, 32 * s, 32 * s);
  ctx.font = `500 ${17 * s}px Inter, sans-serif`;
  ctx.fillStyle = '#cbd5e1';
  const nav = kind === 'text' ? ['Rules', 'Hints'] : kind === 'tiles' ? ['All', 'Saved'] : kind === 'docs' ? ['Docs', 'Reference', 'Status'] : ['Home', 'Shop', 'Account'];
  nav.forEach((n, i) => ctx.fillText(n, (200 + i * 100) * s, 32 * s));

  const px = 48 * s;
  let y = 120 * s;
  const line = (w: number, h = 14) => { ctx.fillStyle = '#e5e7eb'; rr(ctx, px, y, w * s, h * s, 7 * s); ctx.fill(); y += (h + 16) * s; };
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${34 * s}px Inter, sans-serif`;

  if (kind === 'login') {
    ctx.fillText(o.title || 'Sign in', px, y); y += 56 * s;
    for (const label of ['email', 'password']) {
      ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2 * s; rr(ctx, px, y, 520 * s, 52 * s, 8 * s); ctx.stroke();
      ctx.fillStyle = '#64748b'; ctx.font = `400 ${18 * s}px Inter, sans-serif`;
      const val = label === 'email' && o.typed ? o.typed : label;
      ctx.fillStyle = label === 'email' && o.typed ? '#0f172a' : '#94a3b8';
      ctx.fillText(val, px + 16 * s, y + 26 * s);
      y += 72 * s;
    }
    ctx.fillStyle = '#2563eb'; rr(ctx, px, y, 150 * s, 50 * s, 8 * s); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `600 ${18 * s}px Inter, sans-serif`; ctx.fillText('Sign in', px + 40 * s, y + 25 * s);
    y += 90 * s; line(380);
  } else if (kind === 'text' || kind === 'docs') {
    ctx.fillText(o.title || (kind === 'docs' ? 'Endpoints' : 'Cookie jar'), px, y); y += 56 * s;
    [1100, 1020, 860, 1060, 520, 0, 980, 900, 640].forEach((w) => (w ? line(w) : (y += 20 * s)));
    if (kind === 'docs') {
      ctx.fillStyle = '#f1f5f9'; rr(ctx, px, y, 1100 * s, 150 * s, 10 * s); ctx.fill();
      ctx.fillStyle = '#334155'; ctx.font = `500 ${18 * s}px "JetBrains Mono Variable", monospace`;
      ['GET  /v1/mirror?text=hello', '→ { "olleh": true }', 'POST /v1/mirror/secret'].forEach((t, i) => ctx.fillText(t, px + 20 * s, y + (36 + i * 40) * s));
    }
  } else {
    ctx.fillText(o.title || (kind === 'account' ? 'Saved items (9)' : 'Gallery'), px, y); y += 50 * s;
    const cols = 3, gw = (1280 - 96 - 40) / cols;
    const rows = kind === 'tiles' ? 2 : 1;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      ctx.fillStyle = '#f1f5f9'; ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2 * s;
      rr(ctx, px + c * (gw + 20) * s, y + r * 170 * s, gw * s, 150 * s, 12 * s); ctx.fill(); ctx.stroke();
    }
    y += rows * 170 * s + 20 * s;
    if (kind === 'account') {
      line(700);
      ctx.fillStyle = '#2563eb'; rr(ctx, px, y, 170 * s, 50 * s, 8 * s); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `600 ${18 * s}px Inter, sans-serif`; ctx.fillText('reset link', px + 40 * s, y + 25 * s);
      y += 80 * s; line(1000); line(600);
    }
  }

  // cursor + click ring
  if (o.cursor) {
    const cx = o.cursor.x * W, cy = o.cursor.y * H;
    if (o.cursor.click && o.t !== undefined) {
      const age = (o.t - o.cursor.click) / 600;
      if (age >= 0 && age < 1) {
        ctx.strokeStyle = `rgba(239,68,68,${0.7 * (1 - age)})`; ctx.lineWidth = 4 * s;
        ctx.beginPath(); ctx.arc(cx, cy, (14 + 30 * age) * s, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.fillStyle = '#ef4444'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 6 * s, cy + 22 * s); ctx.lineTo(cx + 11 * s, cy + 13 * s); ctx.lineTo(cx + 21 * s, cy + 11 * s); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

export function pageDataUrl(kind: PageKind, title?: string, w = 640, h = 400): string {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  drawPage(c.getContext('2d')!, kind, w, h, { title });
  return c.toDataURL('image/png');
}
