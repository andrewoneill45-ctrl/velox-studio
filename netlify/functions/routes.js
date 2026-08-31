import { json, readJSON, writeJSON, store } from "./_lib.js";
export default async (req) => {
  const u = new URL(req.url), id = u.searchParams.get("id");
  if (req.method === "GET") {
    if (id) { const c = await readJSON(`routes/${id}.json`); return c ? json(c) : json({ error: "not_found" }, 404); }
    return json({ routes: await readJSON("routes-index.json", []) });
  }
  if (req.method === "DELETE" && id) {
    await store().delete(`routes/${id}.json`);
    const idx = (await readJSON("routes-index.json", [])).filter(r => r.id !== id);
    await writeJSON("routes-index.json", idx); return json({ ok: true });
  }
  if (req.method === "PATCH" && id) {
    const c = await readJSON(`routes/${id}.json`); if (!c) return json({ error: "not_found" }, 404);
    const b = await req.json();
    if (b.name) c.name = String(b.name).slice(0, 80);
    if (Array.isArray(b.climbs)) b.climbs.forEach(x => { if (c.climbs[x.i] && x.n) c.climbs[x.i].n = String(x.n).slice(0, 60); });
    await writeJSON(`routes/${id}.json`, c);
    const idx = await readJSON("routes-index.json", []);
    const e = idx.find(r => r.id === id); if (e) { e.name = c.name; e.hardest = c.climbs.reduce((a, x) => (x.fiets > (a?.fiets || 0) ? x : a), null)?.n || null; }
    await writeJSON("routes-index.json", idx); return json({ ok: true });
  }
  if (req.method === "POST") {
    const c = await req.json();
    if (!c?.id || !Array.isArray(c.points)) return json({ error: "bad course" }, 400);
    await writeJSON(`routes/${c.id}.json`, c);
    const idx = (await readJSON("routes-index.json", [])).filter(r => r.id !== c.id);
    idx.unshift({ id: c.id, name: c.name, source: c.source, km: c.km, m: c.m, climbs: c.climbs.length,
      hardest: c.climbs.reduce((a, b) => (b.fiets > (a?.fiets || 0) ? b : a), null)?.n || null, createdAt: c.createdAt });
    await writeJSON("routes-index.json", idx.slice(0, 200));
    return json({ ok: true, id: c.id });
  }
  return json({ error: "method" }, 405);
};
