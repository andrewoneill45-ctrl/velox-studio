import { json, readJSON, writeJSON, stravaToken, strava, getProfile } from "./_lib.js";

const ds = (a, n) => { if (!a || a.length <= n) return a || [];
  const o = []; for (let i = 0; i < n; i++) o.push(a[Math.round(i * (a.length - 1) / (n - 1))]); return o; };
const rolling30 = (w, t) => { const o = []; let j = 0;
  for (let i = 0; i < w.length; i++) { while (t[i] - t[j] > 30) j++;
    let s = 0; for (let k = j; k <= i; k++) s += w[k] || 0; o.push(s / (i - j + 1)); } return o; };
const np = (w, t) => { if (!w?.length) return null;
  const r = rolling30(w, t); return Math.round((r.reduce((a, v) => a + v ** 4, 0) / r.length) ** 0.25); };
const bestAvg = (w, t, dur) => { if (!w?.length) return 0; let best = 0, j = 0, sum = 0;
  for (let i = 0; i < w.length; i++) { sum += w[i] || 0;
    while (t[i] - t[j] > dur) { sum -= w[j] || 0; j++; }
    if (t[i] - t[j] >= dur * 0.94) best = Math.max(best, sum / (i - j + 1)); } return Math.round(best); };
const trim = a => ({ id: a.id, name: a.name, start_date: a.start_date, distance: a.distance,
  moving_time: a.moving_time, total_elevation_gain: a.total_elevation_gain,
  weighted_average_watts: a.weighted_average_watts, average_watts: a.average_watts,
  average_heartrate: a.average_heartrate, type: a.sport_type || a.type, trainer: !!a.trainer });
const isRide = a => /ride/i.test(a.type || "");

export default async () => {
  const tok = await stravaToken();
  if (!tok) return json({ error: "not_connected" }, 401);
  const prof = await getProfile();
  const FTP = prof.ftp || 180;
  const estTss = a => { const NP = a.weighted_average_watts;
    return NP ? Math.round((a.moving_time / 3600) * NP * (NP / FTP) / FTP * 100)
              : Math.round((a.moving_time / 3600) * 55); };

  // 1 · full-history, incremental activity list
  let stored = await readJSON("activities.json", []);
  const latest = stored.length ? Math.max(...stored.map(a => +new Date(a.start_date))) : 0;
  const after = latest ? Math.floor(latest / 1000) - 86400 : 0;
  let fresh = [], page = 1;
  while (page <= 30) {
    const r = await strava(`/athlete/activities?after=${after}&per_page=200&page=${page}`, tok.access_token);
    if (!r.ok) return json({ error: "strava_" + r.status, detail: await r.text() }, 502);
    const b = await r.json(); fresh = fresh.concat(b);
    if (b.length < 200) break; page++;
  }
  const byId = new Map(stored.map(a => [a.id, a]));
  for (const a of fresh) byId.set(a.id, trim(a));
  const all = [...byId.values()].sort((x, y) => new Date(y.start_date) - new Date(x.start_date));
  await writeJSON("activities.json", all);
  const acts = all.filter(isRide);

  // 2 · streams + per-ride metrics for the latest 15 rides
  const rides = [];
  for (const a of acts.slice(0, 15)) {
    let st = await readJSON(`streams/${a.id}.json`);
    if (!st) {
      const r = await strava(`/activities/${a.id}/streams?keys=time,watts,heartrate,cadence,velocity_smooth,altitude,latlng&key_by_type=true`, tok.access_token);
      if (r.ok) { const raw = await r.json(); const N = 1100;
        st = { time: ds(raw.time?.data, N), watts: ds(raw.watts?.data, N), hr: ds(raw.heartrate?.data, N),
               cad: ds(raw.cadence?.data, N), vel: ds(raw.velocity_smooth?.data, N),
               alt: ds(raw.altitude?.data, N), latlng: ds(raw.latlng?.data, N) };
        await writeJSON(`streams/${a.id}.json`, st); }
    }
    const t = st?.time || [], w = st?.watts || [];
    const NP = w.length ? np(w, t) : (a.weighted_average_watts || null);
    const hrs = (a.moving_time || 0) / 3600;
    const TSS = NP ? Math.round(hrs * NP * (NP / FTP) / FTP * 100) : estTss(a);
    let dec = null;
    if (w.length && st.hr?.length) { const h = Math.floor(w.length / 2);
      const eff = (ws, hs) => { const mw = ws.reduce((x, y) => x + y, 0) / ws.length, mh = hs.reduce((x, y) => x + y, 0) / hs.length; return mh ? mw / mh : 0; };
      const e1 = eff(w.slice(0, h), st.hr.slice(0, h)), e2 = eff(w.slice(h), st.hr.slice(h));
      if (e1) dec = +(((e1 - e2) / e1) * 100).toFixed(1); }
    rides.push({ id: a.id, nm: a.name, date: a.start_date,
      dt: new Date(a.start_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).toUpperCase(),
      km: +(a.distance / 1000).toFixed(1), m: Math.round(a.total_elevation_gain || 0),
      secs: a.moving_time, np: NP, iff: NP ? +(NP / FTP).toFixed(2) : null, tss: TSS,
      hr: Math.round(a.average_heartrate || 0) || null,
      vi: NP && a.average_watts ? +(NP / a.average_watts).toFixed(2) : null,
      dec, gps: !!(st?.latlng?.length), trainer: a.trainer,
      b5: w.length ? bestAvg(w, t, 5) : 0, b60: w.length ? bestAvg(w, t, 60) : 0,
      b300: w.length ? bestAvg(w, t, 300) : 0, b1200: w.length ? bestAvg(w, t, 1200) : 0 });
  }

  // 3 · daily TSS across full history
  const daily = {};
  for (const a of acts) { const d = a.start_date.slice(0, 10);
    const det = rides.find(r => r.id === a.id);
    daily[d] = (daily[d] || 0) + (det ? det.tss : estTss(a)); }

  // 4 · PMC from history start (≤ 2 years), publish last 120 days
  const first = acts.length ? Math.max(Date.now() - 730 * 864e5, +new Date(acts[acts.length - 1].start_date)) : Date.now() - 120 * 864e5;
  let ctl = 0, atl = 0; const pmcAll = [];
  for (let ts = first; ts <= Date.now(); ts += 864e5) {
    const d = new Date(ts).toISOString().slice(0, 10);
    const load = daily[d] || 0;
    ctl += (load - ctl) / 42; atl += (load - atl) / 7;
    pmcAll.push({ d, ctl: +ctl.toFixed(1), atl: +atl.toFixed(1), tsb: +(ctl - atl).toFixed(1) });
  }
  const pmc = pmcAll.slice(-120);

  // 5 · season aggregates
  const s0 = new Date((prof.seasonStart || "2026-03-16") + "T00:00:00Z");
  const weeks = new Array(16).fill(0), wkCount = new Array(16).fill(0);
  for (const [d, v] of Object.entries(daily)) {
    const wi = Math.floor((new Date(d + "T12:00:00Z") - s0) / (7 * 864e5));
    if (wi >= 0 && wi < 16) weeks[wi] += v; }
  const seasonActs = acts.filter(a => new Date(a.start_date) >= s0);
  for (const a of seasonActs) { const wi = Math.floor((new Date(a.start_date) - s0) / (7 * 864e5));
    if (wi >= 0 && wi < 16) wkCount[wi]++; }
  const curWeek = Math.max(0, Math.min(15, Math.floor((Date.now() - s0) / (7 * 864e5))));
  let chain = 0, chainMax = 0, run = 0;
  for (let i = 0; i <= curWeek; i++) { if (wkCount[i] >= 3 || weeks[i] >= 250) { run++; chainMax = Math.max(chainMax, run); } else run = 0; }
  for (let i = curWeek; i >= 0; i--) { if (wkCount[i] >= 3 || weeks[i] >= 250) chain++; else break; }
  const monthly = [];
  for (const a of seasonActs) { const lb = new Date(a.start_date).toLocaleDateString("en-GB", { month: "short" }).toUpperCase();
    const e = monthly.find(x => x.label === lb); if (e) e.m += a.total_elevation_gain || 0;
    else monthly.push({ label: lb, m: a.total_elevation_gain || 0 }); }
  monthly.reverse(); monthly.forEach(x => x.m = Math.round(x.m));
  const days14 = [];
  for (let i = 13; i >= 0; i--) { const dt = new Date(Date.now() - i * 864e5), d = dt.toISOString().slice(0, 10);
    const list = seasonActs.filter(a => a.start_date.slice(0, 10) === d);
    days14.push({ d, dow: dt.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase(),
      nm: list[0]?.name || null, n: list.length,
      tss: list.reduce((s, a) => s + (rides.find(r => r.id === a.id)?.tss ?? estTss(a)), 0),
      km: +(list.reduce((s, a) => s + a.distance, 0) / 1000).toFixed(0),
      m: Math.round(list.reduce((s, a) => s + (a.total_elevation_gain || 0), 0)) }); }

  // 6 · zones (28d) + season bests
  const zE = [0, .55, .75, .90, 1.05, 1.20, 1.50, 99].map(x => x * FTP);
  const zsec = new Array(7).fill(0);
  for (const rd of rides) { if (Date.now() - new Date(rd.date) > 28 * 864e5) continue;
    const st = await readJSON(`streams/${rd.id}.json`); if (!st?.watts?.length) continue;
    const dt = (st.time[st.time.length - 1] - st.time[0]) / st.watts.length;
    for (const w of st.watts) { const zi = zE.findIndex((e, i) => w >= e && w < zE[i + 1]);
      if (zi >= 0 && zi < 7) zsec[zi] += dt; } }
  const zt = zsec.reduce((a, b) => a + b, 0) || 1;
  const zones28 = zsec.map(s => ({ pct: Math.round(s / zt * 100), hrs: +(s / 3600).toFixed(1) }));
  const prev = await readJSON("metrics.json", {});
  const keep = (o, v, rd) => (!o || v > o.v) ? { v, d: rd.dt, nm: rd.nm } : o;
  let bests = prev.bests || {};
  for (const rd of rides) {
    if (rd.b5) bests.s5 = keep(bests.s5, rd.b5, rd);
    if (rd.b60) bests.m1 = keep(bests.m1, rd.b60, rd);
    if (rd.b300) bests.m5 = keep(bests.m5, rd.b300, rd);
    if (rd.b1200) bests.m20 = keep(bests.m20, rd.b1200, rd); }
  const climb = Math.round(seasonActs.reduce((s, a) => s + (a.total_elevation_gain || 0), 0));
  const weeksElapsed = Math.max(1, curWeek + 1);

  const metrics = { syncedAt: new Date().toISOString(), pmc, weeks: weeks.map(Math.round), curWeek,
    zones28, bests, climb, everests: +(climb / 8849).toFixed(2), chain, chainMax,
    monthly, days14, weeksElapsed, avgClimbWk: Math.round(climb / weeksElapsed),
    totalActivities: acts.length,
    tssSeason: Math.round(Object.entries(daily).filter(([d]) => new Date(d) >= s0).reduce((s, [, v]) => s + v, 0)),
    rideIndex: rides.map(({ b5, b60, b300, b1200, ...r }) => r) };
  await writeJSON("metrics.json", metrics);
  return json({ ok: true, rides: rides.length, activities: acts.length, total: all.length, syncedAt: metrics.syncedAt });
};
