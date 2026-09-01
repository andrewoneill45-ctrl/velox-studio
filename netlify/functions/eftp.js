import { json, readJSON, writeJSON, store, getProfile } from "./_lib.js";
const DUR = [5, 15, 30, 60, 120, 180, 240, 300, 360, 480, 600, 720, 960, 1200, 1500, 1800, 2400, 3600];
const CACHE_V = 2;
const bestAvg = (w, t, dur) => { if (!w?.length) return 0; let best = 0, j = 0, sum = 0;
  for (let i = 0; i < w.length; i++) { sum += w[i] || 0;
    while (t[i] - t[j] > dur) { sum -= w[j] || 0; j++; }
    if (t[i] - t[j] >= dur * 0.94) best = Math.max(best, sum / (i - j + 1)); } return Math.round(best); };
function cpFit(pts) { // pts: [{t,p}] — asymmetric robust fit: submaximal points get discarded, they are not evidence
  let cur = pts.slice(), fit = null;
  for (let round = 0; round < 4; round++) {
    const n = cur.length; if (n < 2) return null;
    const sx = cur.reduce((s, q) => s + q.t, 0), sy = cur.reduce((s, q) => s + q.p * q.t, 0);
    const sxx = cur.reduce((s, q) => s + q.t * q.t, 0), sxy = cur.reduce((s, q) => s + q.t * q.p * q.t, 0);
    const cp = (n * sxy - sx * sy) / (n * sxx - sx * sx), wp = (sy - cp * sx) / n;
    fit = { cp, wp, used: cur };
    const keep = cur.filter(q => q.p >= (cp + wp / q.t) * 0.97);
    if (keep.length === cur.length || keep.length < 2) break;
    cur = keep;
  }
  return fit;
}
export default async () => {
  const prof = await getProfile();
  const { blobs } = await store().list({ prefix: "streams/" });
  const keys = (blobs || []).map(b => b.key);
  let cache = await readJSON("efforts-cache.json", { rides: {} });
  if (cache.v !== CACHE_V) cache = { v: CACHE_V, rides: {} };
  let budget = 80, partial = false;
  const acts = await readJSON("activities.json", []);
  const byId = new Map(acts.map(a => [String(a.id), a]));
  let changed = false;
  for (const k of keys) {
    const id = k.replace("streams/", "").replace(".json", "");
    if (cache.rides[id] !== undefined) continue;
    if (budget-- <= 0) { partial = true; break; }
    const st = await readJSON(k); if (!st?.watts?.length) { cache.rides[id] = null; changed = true; continue; }
    const a = byId.get(id), e = {};
    for (const d of DUR) { const v = bestAvg(st.watts, st.time, d); if (v > 40) e[d] = v; }
    cache.rides[id] = { d: (a?.start_date || "").slice(0, 10), nm: a?.name || "Ride", e };
    changed = true;
  }
  if (changed) await writeJSON("efforts-cache.json", cache);
  const rides = Object.values(cache.rides).filter(Boolean);
  const curveOfSet = set => DUR.map(d => { let b = null; for (const r of set) { const p = r.e?.[d]; if (p && (!b || p > b.w)) b = { w: p, d: r.d, nm: r.nm }; } return b; });
  const dayMs = 864e5, season0 = prof.seasonStart || "2026-03-16", t42 = new Date(Date.now() - 42 * dayMs).toISOString().slice(0, 10);
  const curve = DUR.map((d, i) => ({ dur: d, all: curveOfSet(rides)[i], season: curveOfSet(rides.filter(r => r.d >= season0))[i], recent: curveOfSet(rides.filter(r => r.d >= t42))[i] }));
  const today = Date.now(), day = 864e5;
  const windowOf = days => rides.filter(r => r.d && (today - +new Date(r.d)) <= days * day);
  const curveOf = set => { const c = {}; for (const r of set) for (const [d, p] of Object.entries(r.e || {}))
    if (!c[d] || p > c[d].p) c[d] = { p, d: r.d, nm: r.nm }; return c; };
  const all = curveOf(rides);
  let windowDays = 42, W = windowOf(42);
  if (W.length < 3) { windowDays = 90; W = windowOf(90); }
  const cur = curveOf(W);
  // qualifying: within 90% of all-synced best at that duration — easy weeks are not evidence of decline
  const qual = {}; for (const d of DUR) if (cur[d] && all[d] && cur[d].p >= all[d].p * 0.90) qual[d] = cur[d];
  const fitPts = DUR.filter(d => d >= 180 && d <= 1500 && qual[d]).map(d => ({ t: d, p: qual[d].p }));
  const fit = fitPts.length >= 2 ? cpFit(fitPts) : null;
  const usedDurs = fit ? fit.used.map(q => q.t) : [];
  const spanOK = usedDurs.some(t => t <= 480) && usedDurs.some(t => t >= 600);
  const cands = [];
  if (fit && spanOK && fit.cp > 80 && fit.cp < 500) cands.push({ src: "CP fit (" + fit.used.length + " durations)", v: fit.cp });
  if (qual[1200]) cands.push({ src: "95% of best 20 min", v: qual[1200].p * 0.95 });
  if (qual[1800]) cands.push({ src: "96% of best 30 min", v: qual[1800].p * 0.96 });
  if (qual[3600]) cands.push({ src: "best 60 min", v: qual[3600].p });
  if (qual[600] && !qual[1200] && !qual[1800]) cands.push({ src: "90% of best 10 min", v: qual[600].p * 0.90 });
  const evidence = DUR.filter(d => qual[d]).map(d => ({ dur: d, w: qual[d].p, date: qual[d].d, nm: qual[d].nm,
    used: usedDurs.includes(d) || [600,1200,1800,3600].includes(d) }));
  const newestEv = evidence.length ? Math.max(...evidence.map(e => +new Date(e.date))) : 0;
  const ageDays = newestEv ? Math.round((today - newestEv) / day) : null;
  if (!cands.length) return json({ ok: true, suggest: null, reason: "no_evidence", windowDays, ageDays, curve, partial, cached: rides.length,
    note: "No maximal efforts in the window — nothing here says your FTP has changed. Two hard 4–8 minute efforts plus one strong 15–20 minutes would give eFTP something to read.",
    evidence, streams: keys.length });
  const vs = cands.map(c => c.v).sort((a, b) => a - b);
  const eftp = Math.round(vs[Math.floor(vs.length / 2)]);
  const spread = (vs[vs.length - 1] - vs[0]) / eftp;
  const conf = (cands.length >= 3 && spread <= 0.04 && ageDays <= 28 && spanOK) ? "high"
             : (cands.length >= 2 && spread <= 0.07 && ageDays <= 42) ? "medium" : "low";
  const lower = eftp < (prof.ftp || 0) - 3;
  const stale = ageDays != null && ageDays > 21;
  const withhold = lower && stale;
  return json({ ok: true, curve, partial, cached: rides.length,
    suggest: withhold ? null : eftp,
    reason: withhold ? "stale_lower" : null,
    note: withhold ? `The model reads ${eftp} W, but the freshest maximal effort is ${ageDays} days old — an easy block isn't evidence of decline. A fresh 4–8 minute and a 15–20 minute effort would settle it.` : null,
    current: prof.ftp || null, conf, windowDays, ageDays, spreadPct: +(spread * 100).toFixed(1),
    candidates: cands.map(c => ({ src: c.src, v: Math.round(c.v) })),
    cp: fit && spanOK ? Math.round(fit.cp) : null, wprime: fit && spanOK ? Math.round(fit.wp / 100) / 10 : null,
    evidence, streams: keys.length,
    method: `Best efforts from ${rides.length} rides with power, ${windowDays}-day window, asymmetric CP fit + duration cross-checks, median of ${cands.length} candidates.` });
};
