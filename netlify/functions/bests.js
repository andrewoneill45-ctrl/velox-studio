import { json, readJSON, writeJSON, store } from "./_lib.js";
const bestAvg = (w, t, dur) => { if (!w?.length) return 0; let best = 0, j = 0, sum = 0;
  for (let i = 0; i < w.length; i++) { sum += w[i] || 0;
    while (t[i] - t[j] > dur) { sum -= w[j] || 0; j++; }
    if (t[i] - t[j] >= dur * 0.94) best = Math.max(best, sum / (i - j + 1)); } return Math.round(best); };
export default async () => {
  const { blobs } = await store().list({ prefix: "streams/" });
  const keys = (blobs || []).map(b => b.key);
  const cache = await readJSON("bests-cache.json");
  if (cache && cache.n === keys.length) return json(cache);
  const acts = await readJSON("activities.json", []);
  const byId = new Map(acts.map(a => [String(a.id), a]));
  const rides = [];
  for (const k of keys) {
    const id = k.replace("streams/", "").replace(".json", "");
    const st = await readJSON(k); if (!st?.watts?.length) continue;
    const a = byId.get(id);
    rides.push({ id, nm: a?.name || "Ride", d: (a?.start_date || "").slice(0, 10),
      s5: bestAvg(st.watts, st.time, 5), m1: bestAvg(st.watts, st.time, 60), m5: bestAvg(st.watts, st.time, 300),
      m20: bestAvg(st.watts, st.time, 1200), m60: bestAvg(st.watts, st.time, 3600) });
  }
  rides.sort((x, y) => x.d < y.d ? 1 : -1);
  const out = { n: keys.length, rides };
  await writeJSON("bests-cache.json", out);
  return json(out);
};
