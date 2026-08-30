import { json, readJSON, writeJSON, stravaToken, strava, getProfile } from "./_lib.js";

const ds = (arr, n) => { if (!arr || arr.length <= n) return arr || [];
  const out = []; for (let i = 0; i < n; i++) out.push(arr[Math.round(i * (arr.length - 1) / (n - 1))]); return out; };
const rolling30 = (w, t) => { // 30s rolling avg of power using time array
  const out = []; let j = 0;
  for (let i = 0; i < w.length; i++) { while (t[i] - t[j] > 30) j++;
    let s = 0; for (let k = j; k <= i; k++) s += w[k] || 0; out.push(s / (i - j + 1)); }
  return out; };
const np = (w, t) => { if (!w?.length) return null;
  const r = rolling30(w, t); const m = r.reduce((a, v) => a + v ** 4, 0) / r.length; return Math.round(m ** 0.25); };
const bestAvg = (w, t, dur) => { if (!w?.length) return 0;
  let best = 0, j = 0, sum = 0;
  for (let i = 0; i < w.length; i++) { sum += w[i] || 0;
    while (t[i] - t[j] > dur) { sum -= w[j] || 0; j++; }
    if (t[i] - t[j] >= dur * 0.94) best = Math.max(best, sum / (i - j + 1)); }
  return Math.round(best); };

export default async (req) => {
  const tok = await stravaToken();
  if (!tok) return json({ error: "not_connected" }, 401);
  const prof = await getProfile();
  const FTP = prof.ftp || 280;

  // 1 · activity summaries (last ~120 days)
  const after = Math.floor((Date.now() - 120 * 864e5) / 1000);
  let acts = [], page = 1;
  while (page <= 4) {
    const r = await strava(`/athlete/activities?after=${after}&per_page=100&page=${page}`, tok.access_token);
    if (!r.ok) return json({ error: "strava_" + r.status, detail: await r.text() }, 502);
    const batch = await r.json(); acts = acts.concat(batch);
    if (batch.length < 100) break; page++;
  }
  acts = acts.filter(a => ["Ride", "VirtualRide", "GravelRide", "MountainBikeRide"].includes(a.type) || a.sport_type?.includes("Ride"));

  // 2 · streams + per-ride metrics for the latest 12
  const detailIds = acts.slice(0, 12).map(a => a.id);
  const rides = [];
  for (const a of acts.slice(0, 12)) {
    let st = await readJSON(`streams/${a.id}.json`);
    if (!st) {
      const r = await strava(`/activities/${a.id}/streams?keys=time,watts,heartrate,cadence,velocity_smooth,altitude,latlng&key_by_type=true`, tok.access_token);
      if (r.ok) {
        const raw = await r.json();
        const N = 1100;
        st = { time: ds(raw.time?.data, N), watts: ds(raw.watts?.data, N), hr: ds(raw.heartrate?.data, N),
               cad: ds(raw.cadence?.data, N), vel: ds(raw.velocity_smooth?.data, N),
               alt: ds(raw.altitude?.data, N), latlng: ds(raw.latlng?.data, N) };
        await writeJSON(`streams/${a.id}.json`, st);
      }
    }
    const t = st?.time || [], w = st?.watts || [];
    const NP = w.length ? np(w, t) : (a.weighted_average_watts || null);
    const IF = NP ? +(NP / FTP).toFixed(2) : null;
    const hrs = (a.moving_time || 0) / 3600;
    const TSS = NP ? Math.round(hrs * NP * (NP / FTP) / FTP * 100) : Math.round(hrs * 55);
    let dec = null;
    if (w.length && st.hr?.length) {
      const h = Math.floor(w.length / 2);
      const eff = (ws, hs) => { const mw = ws.reduce((x, y) => x + y, 0) / ws.length, mh = hs.reduce((x, y) => x + y, 0) / hs.length; return mh ? mw / mh : 0; };
      const e1 = eff(w.slice(0, h), st.hr.slice(0, h)), e2 = eff(w.slice(h), st.hr.slice(h));
      if (e1) dec = +(((e1 - e2) / e1) * 100).toFixed(1);
    }
    rides.push({ id: a.id, nm: a.name, date: a.start_date,
      dt: new Date(a.start_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).toUpperCase(),
      km: +(a.distance / 1000).toFixed(1), m: Math.round(a.total_elevation_gain || 0),
      secs: a.moving_time, np: NP, iff: IF, tss: TSS,
      hr: Math.round(a.average_heartrate || 0) || null,
      vi: NP && a.average_watts ? +(NP / a.average_watts).toFixed(2) : null,
      dec, gps: !!(st?.latlng?.length), trainer: !!a.trainer,
      b5: w.length ? bestAvg(w, t, 5) : 0, b60: w.length ? bestAvg(w, t, 60) : 0,
      b300: w.length ? bestAvg(w, t, 300) : 0, b1200: w.length ? bestAvg(w, t, 1200) : 0 });
  }

  // 3 · daily TSS for everything (estimates where no detail)
  const daily = {};
  for (const a of acts) {
    const d = a.start_date.slice(0, 10);
    const det = rides.find(r => r.id === a.id);
    let tss = det?.tss;
    if (tss == null) {
      const NP = a.weighted_average_watts;
      tss = NP ? Math.round((a.moving_time / 3600) * NP * (NP / FTP) / FTP * 100) : Math.round((a.moving_time / 3600) * 55);
    }
    daily[d] = (daily[d] || 0) + tss;
  }

  // 4 · PMC (last 100 days) + weekly TSS anchored to seasonStart
  let ctl = 30, atl = 30; const pmc = [];
  for (let i = 99; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const load = daily[d] || 0;
    ctl += (load - ctl) / 42; atl += (load - atl) / 7;
    pmc.push({ d, ctl: +ctl.toFixed(1), atl: +atl.toFixed(1), tsb: +(ctl - atl).toFixed(1) });
  }
  const s0 = new Date(prof.seasonStart + "T00:00:00Z");
  const weeks = new Array(16).fill(0);
  for (const [d, v] of Object.entries(daily)) {
    const wi = Math.floor((new Date(d + "T12:00:00Z") - s0) / (7 * 864e5));
    if (wi >= 0 && wi < 16) weeks[wi] += v;
  }
  const curWeek = Math.max(0, Math.min(15, Math.floor((Date.now() - s0) / (7 * 864e5))));

  // 5 · zones (28d, stream-based), bests, climbing, chain
  const zEdges = [0, .55, .75, .90, 1.05, 1.20, 1.50, 99].map(x => x * FTP);
  const zsec = new Array(7).fill(0);
  for (const rd of rides) {
    if (Date.now() - new Date(rd.date) > 28 * 864e5) continue;
    const st = await readJSON(`streams/${rd.id}.json`); if (!st?.watts?.length) continue;
    const dt = (st.time[st.time.length - 1] - st.time[0]) / st.watts.length;
    for (const w of st.watts) { const zi = zEdges.findIndex((e, i) => w >= e && w < zEdges[i + 1]);
      if (zi >= 0 && zi < 7) zsec[zi] += dt; }
  }
  const ztot = zsec.reduce((a, b) => a + b, 0) || 1;
  const zones28 = zsec.map(s => ({ pct: Math.round(s / ztot * 100), hrs: +(s / 3600).toFixed(1) }));

  const prev = await readJSON("metrics.json", {});
  const keep = (o, v, rd, dur) => (!o || v > o.v) ? { v, d: rd.dt, nm: rd.nm, dur } : o;
  let bests = prev.bests || {};
  for (const rd of rides) {
    if (rd.b5) bests.s5 = keep(bests.s5, rd.b5, rd, "5 SEC");
    if (rd.b60) bests.m1 = keep(bests.m1, rd.b60, rd, "1 MIN");
    if (rd.b300) bests.m5 = keep(bests.m5, rd.b300, rd, "5 MIN");
    if (rd.b1200) bests.m20 = keep(bests.m20, rd.b1200, rd, "20 MIN");
  }
  const seasonActs = acts.filter(a => new Date(a.start_date) >= s0);
  const climb = Math.round(seasonActs.reduce((s, a) => s + (a.total_elevation_gain || 0), 0));
  // consistency chain: consecutive weeks (ending this week) with 3+ rides or 250+ TSS
  const wkCount = new Array(16).fill(0);
  for (const a of seasonActs) { const wi = Math.floor((new Date(a.start_date) - s0) / (7 * 864e5));
    if (wi >= 0 && wi < 16) wkCount[wi]++; }
  let chain = 0;
  for (let i = curWeek; i >= 0; i--) { if (wkCount[i] >= 3 || weeks[i] >= 250) chain++; else break; }

  const metrics = { syncedAt: new Date().toISOString(), pmc, weeks: weeks.map(Math.round), curWeek,
    zones28, bests, climb, everests: +(climb / 8849).toFixed(2), chain,
    tssSeason: Math.round(Object.entries(daily).filter(([d]) => new Date(d) >= s0).reduce((s, [, v]) => s + v, 0)),
    rideIndex: rides.map(({ b5, b60, b300, b1200, ...r }) => r) };
  await writeJSON("metrics.json", metrics);
  return json({ ok: true, rides: rides.length, activities: acts.length, syncedAt: metrics.syncedAt });
};
