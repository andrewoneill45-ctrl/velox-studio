import { readJSON, writeJSON, stravaToken, strava } from "./_lib.js";
const ds = (a, n) => { if (!a || a.length <= n) return a || []; const o = []; for (let i = 0; i < n; i++) o.push(a[Math.round(i * (a.length - 1) / (n - 1))]); return o; };
const trim = a => ({ id: a.id, name: a.name, start_date: a.start_date, distance: a.distance, moving_time: a.moving_time,
  total_elevation_gain: a.total_elevation_gain, weighted_average_watts: a.weighted_average_watts, average_watts: a.average_watts,
  average_heartrate: a.average_heartrate, type: a.sport_type || a.type, trainer: !!a.trainer });
export default async (req) => {
  const { id } = await req.json().catch(() => ({}));
  const st = await readJSON("state.json", {});
  try {
    const tok = await stravaToken(); if (!tok || !id) throw new Error("no token or id");
    const r = await strava(`/activities/${id}`, tok.access_token); if (!r.ok) throw new Error("activity " + r.status);
    const a = await r.json();
    const all = await readJSON("activities.json", []);
    const byId = new Map(all.map(x => [x.id, x])); byId.set(a.id, trim(a));
    await writeJSON("activities.json", [...byId.values()].sort((x, y) => new Date(y.start_date) - new Date(x.start_date)));
    if (/ride/i.test(a.sport_type || a.type || "")) {
      const s = await strava(`/activities/${id}/streams?keys=time,watts,heartrate,cadence,velocity_smooth,altitude,latlng&key_by_type=true`, tok.access_token);
      if (s.ok) { const raw = await s.json(), N = 1100;
        await writeJSON(`streams/${id}.json`, { time: ds(raw.time?.data, N), watts: ds(raw.watts?.data, N), hr: ds(raw.heartrate?.data, N),
          cad: ds(raw.cadence?.data, N), vel: ds(raw.velocity_smooth?.data, N), alt: ds(raw.altitude?.data, N), latlng: ds(raw.latlng?.data, N) }); }
    }
    const base = process.env.URL;
    await fetch(`${base}/api/sync?phase=compute`);
    // the debrief is ready before the rider looks
    try { const c = await fetch(`${base}/api/coach`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "debrief", id: String(id) }) });
      if (c.ok) { const d = await c.json(); const cards = await readJSON("cards.json", {}); cards.debriefs = cards.debriefs || {}; cards.debriefs[String(id)] = { at: new Date().toISOString(), card: d.card || null, text: d.text || "" };
        const keys = Object.keys(cards.debriefs).sort(); while (keys.length > 40) delete cards.debriefs[keys.shift()]; await writeJSON("cards.json", cards); } } catch {}
    st.lastIngest = new Date().toISOString(); st.lastIngestId = id; delete st.pending; st.lastError = null;
  } catch (e) { st.lastError = String(e.message || e); st.lastErrorAt = new Date().toISOString(); }
  await writeJSON("state.json", st);
  return new Response("ok");
};
