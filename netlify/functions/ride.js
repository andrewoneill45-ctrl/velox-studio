import { json, readJSON, writeJSON, stravaToken, strava, getProfile, gated } from "./_lib.js";
const ds = (a, n) => { if (!a || a.length <= n) return a || [];
  const o = []; for (let i = 0; i < n; i++) o.push(a[Math.round(i * (a.length - 1) / (n - 1))]); return o; };
const np = (w, t) => { if (!w?.length) return null; const r = []; let j = 0;
  for (let i = 0; i < w.length; i++) { while (t[i] - t[j] > 30) j++;
    let s = 0; for (let k = j; k <= i; k++) s += w[k] || 0; r.push(s / (i - j + 1)); }
  return Math.round((r.reduce((a, v) => a + v ** 4, 0) / r.length) ** 0.25); };
export default gated(async (req) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);
  let st = await readJSON(`streams/${id}.json`);
  if (!st) {
    const tok = await stravaToken();
    if (!tok) return json({ error: "not_connected" }, 401);
    const r = await strava(`/activities/${id}/streams?keys=time,watts,heartrate,cadence,velocity_smooth,altitude,latlng&key_by_type=true`, tok.access_token);
    if (!r.ok) return json({ error: "no_streams", detail: r.status }, 404);
    const raw = await r.json(); const N = 1100;
    st = { time: ds(raw.time?.data, N), watts: ds(raw.watts?.data, N), hr: ds(raw.heartrate?.data, N),
           cad: ds(raw.cadence?.data, N), vel: ds(raw.velocity_smooth?.data, N),
           alt: ds(raw.altitude?.data, N), latlng: ds(raw.latlng?.data, N) };
    await writeJSON(`streams/${id}.json`, st);
  }
  const metrics = await readJSON("metrics.json", {});
  let meta = (metrics.rideIndex || []).find(r => String(r.id) === String(id)) || null;
  if (!meta) {
    const acts = await readJSON("activities.json", []);
    const a = acts.find(x => String(x.id) === String(id));
    if (a) {
      const prof = await getProfile(); const FTP = prof.ftp || 180;
      const NP = st.watts?.length ? np(st.watts, st.time) : (a.weighted_average_watts || null);
      const hrs = (a.moving_time || 0) / 3600;
      let dec = null;
      if (st.watts?.length && st.hr?.length) { const h = Math.floor(st.watts.length / 2);
        const eff = (ws, hs) => { const mw = ws.reduce((x, y) => x + y, 0) / ws.length, mh = hs.reduce((x, y) => x + y, 0) / hs.length; return mh ? mw / mh : 0; };
        const e1 = eff(st.watts.slice(0, h), st.hr.slice(0, h)), e2 = eff(st.watts.slice(h), st.hr.slice(h));
        if (e1) dec = +(((e1 - e2) / e1) * 100).toFixed(1); }
      meta = { id: a.id, nm: a.name,
        dt: new Date(a.start_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).toUpperCase(),
        km: +(a.distance / 1000).toFixed(1), m: Math.round(a.total_elevation_gain || 0), secs: a.moving_time,
        np: NP, iff: NP ? +(NP / FTP).toFixed(2) : null,
        tss: NP ? Math.round(hrs * NP * (NP / FTP) / FTP * 100) : Math.round(hrs * 55),
        hr: Math.round(a.average_heartrate || 0) || null,
        vi: NP && a.average_watts ? +(NP / a.average_watts).toFixed(2) : null,
        dec, gps: !!(st.latlng?.length), trainer: a.trainer };
    }
  }
  return json({ id, meta, streams: st });
});
