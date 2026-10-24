// The README tour: an animated cursor walks through the demo board. Used by tools/record.mjs.
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cur = document.createElement('div');
  cur.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#0a0a0a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  Object.assign(cur.style, { position: 'fixed', left: '0', top: '0', zIndex: 99999, pointerEvents: 'none', transform: 'translate(720px,520px)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.25))' });
  document.body.appendChild(cur);
  let x = 720, y = 520;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  async function moveTo(tx, ty, ms = 700) {
    const sx = x, sy = y, t0 = performance.now();
    while (true) {
      const t = Math.min(1, (performance.now() - t0) / ms), e = ease(t);
      x = sx + (tx - sx) * e; y = sy + (ty - sy) * e - Math.sin(Math.PI * t) * 30;
      cur.style.transform = `translate(${x}px,${y}px)`;
      if (t >= 1) break;
      await new Promise(requestAnimationFrame);
    }
  }
  const find = (sel, text) => { const m = [...document.querySelectorAll(sel)].filter(e => (!text || e.textContent.trim() === text || e.textContent.trim().startsWith(text)) && e.getBoundingClientRect().width > 0); const a = e => { const r = e.getBoundingClientRect(); return r.width * r.height; }; return m.sort((p, q) => a(p) - a(q))[0]; };
  async function click(sel, text, ms) {
    const el = find(sel, text); if (!el) { console.log('missing', sel, text); return; }
    const r = el.getBoundingClientRect();
    await moveTo(r.left + Math.min(r.width / 2, 60), r.top + r.height / 2, ms);
    cur.animate([{ scale: 1 }, { scale: .82 }, { scale: 1 }], { duration: 220 });
    await sleep(120);
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    el.click();
  }
  async function type(el, text, d = 55) {
    el.focus();
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const set = Object.getOwnPropertyDescriptor(proto, 'value').set;
    for (let i = 1; i <= text.length; i++) { set.call(el, text.slice(0, i)); el.dispatchEvent(new Event('input', { bubbles: true })); await sleep(d + Math.random() * 40); }
  }
  window.__tour = 'running';
  await sleep(1800);
  { const t = find('h3, div, span', 'Cookie jar'); const card = t?.closest('[class*="rounded"]') ?? t; const r = t.getBoundingClientRect(); await moveTo(r.left + 40, r.top + r.height / 2, 900); cur.animate([{ scale: 1 }, { scale: .82 }, { scale: 1 }], { duration: 220 }); await sleep(120); t.click(); } await sleep(2600);
  await click('button', 'Full live view'); await sleep(3200);
  await click('button', 'Back to board'); await sleep(1100);
  await click('button[aria-label="Close"]', '', 600); await sleep(900);
  await click('button', 'Live wall'); await sleep(2800);
  await click('button', 'Board'); await sleep(900);
  const sb = find('button, div', 'Search everything'); if (sb) { const r = sb.getBoundingClientRect(); await moveTo(r.left + 120, r.top + r.height / 2); sb.click(); }
  await sleep(500);
  const si = document.querySelector('input[placeholder^="Search everything"]'); if (si) await type(si, 'reset link', 80);
  await sleep(2200);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); si?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(700);
  const ta = document.querySelector('textarea[placeholder^="Message the team"]');
  if (ta) { const r = ta.getBoundingClientRect(); await moveTo(r.left + 80, r.top + 20); await sleep(150); await type(ta, '@board how many are left?', 60); await sleep(300);
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
  await sleep(3500);
  window.__tour = 'done';
})();
