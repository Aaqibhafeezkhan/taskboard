// Serves the testbed on 127.0.0.1:8840 (bun testbed/serve.ts). Local only: agents on this machine can reach it.
const dir = import.meta.dir;
Bun.serve({ port: Number(process.env.PORT ?? 8840), hostname: '127.0.0.1', fetch: req => {
  const p = new URL(req.url).pathname;
  return new Response(Bun.file(`${dir}/${p === '/' ? 'lab.html' : p.replace(/^\/+/, '').replace(/\.\./g, '')}`));
} });
console.log('testbed on http://127.0.0.1:8840/');
