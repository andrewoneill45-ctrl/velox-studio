import { json, readJSON, writeJSON, store, gated } from "./_lib.js";
export async function snapshot() {
  const [profile, ridx, wellness, lidx, cards, state, lite, metrics] = await Promise.all([
    readJSON("profile.json", {}), readJSON("routes-index.json", []), readJSON("wellness.json", {}), readJSON("library-index.json", []),
    readJSON("cards.json", {}), readJSON("state.json", {}), readJSON("activities-lite.json", []), readJSON("metrics.json", {})]);
  const routes = {}; for (const r of ridx) { const c = await readJSON(`routes/${r.id}.json`); if (c) routes[r.id] = c; }
  return { massif: 1, at: new Date().toISOString(), profile, routesIndex: ridx, routes, wellness, libraryIndex: lidx, cards, state,
    activitiesLite: lite, metricsSummary: { syncedAt: metrics.syncedAt, bests: metrics.bests, tssSeason: metrics.tssSeason } };
}
export default gated(async (req) => {
  const u = new URL(req.url);
  if (req.method === "GET") {
    if (u.searchParams.get("list")) { const { blobs } = await store().list({ prefix: "backups/" }); return json({ snapshots: (blobs || []).map(b => b.key.replace("backups/", "").replace(".json", "")).sort().reverse() }); }
    const day = u.searchParams.get("snapshot");
    const data = day ? await readJSON(`backups/${day}.json`) : await snapshot();
    if (!data) return json({ error: "not_found" }, 404);
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="massif-backup-${day || data.at.slice(0, 10)}.json"` } });
  }
  if (req.method === "POST") {
    const b = await req.json().catch(() => null); if (!b || b.massif !== 1) return json({ error: "not a Massif backup" }, 400);
    const done = [];
    if (b.profile && u.searchParams.get("profile") === "1") { await writeJSON("profile.json", b.profile); done.push("profile"); }
    if (b.routes) { for (const [id, c] of Object.entries(b.routes)) await writeJSON(`routes/${id}.json`, c);
      const idx = await readJSON("routes-index.json", []); const have = new Set(idx.map(r => r.id));
      for (const r of (b.routesIndex || [])) if (!have.has(r.id)) idx.push(r); await writeJSON("routes-index.json", idx); done.push("routes"); }
    if (b.wellness) { const w = await readJSON("wellness.json", {}); await writeJSON("wellness.json", { ...b.wellness, ...w }); done.push("wellness"); }
    if (b.libraryIndex && b.libraryIndex.length) { const idx = await readJSON("library-index.json", []); if (!idx.length) { await writeJSON("library-index.json", b.libraryIndex); done.push("library index"); } }
    return json({ ok: true, restored: done, note: "Rides, streams and computed metrics are never overwritten by a restore." });
  }
  return json({ error: "method" }, 405);
});
