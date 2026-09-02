import { json, readJSON, writeJSON, getProfile, wellnessSummary, gated } from "./_lib.js";
const MAP = { heart_rate_variability: "hrv", resting_heart_rate: "rhr", respiratory_rate: "rr",
  apple_sleeping_wrist_temperature: "temp", weight_body_mass: "weight", vo2_max: "vo2",
  sleep_analysis: "sleep", step_count: "steps", blood_oxygen_saturation: "spo2", heart_rate: "hr" };
export default gated(async (req) => {
  const u = new URL(req.url);
  if (req.method !== "POST") {
    const s = await wellnessSummary();
    return json({ configured: !!process.env.HEALTH_INGEST_KEY, days: s.days.slice(-90), latest: s.latest, readiness: s.readiness });
  }
  const key = u.searchParams.get("key") || req.headers.get("x-velox-key");
  if (!process.env.HEALTH_INGEST_KEY || key !== process.env.HEALTH_INGEST_KEY) return json({ error: "unauthorised" }, 401);
  let body; try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const metrics = body?.data?.metrics || body?.metrics || [];
  const W = await readJSON("wellness.json", {});
  let touched = 0, latestWeight = null;
  for (const m of metrics) {
    const k = MAP[(m.name || "").toLowerCase()]; if (!k) continue;
    for (const row of m.data || []) {
      const d = String(row.date || row.sleepEnd || "").slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      const rec = W[d] || (W[d] = { d });
      if (k === "sleep") {
        const hrs = v => v == null ? undefined : (/min/i.test(m.units || "") ? v / 60 : v);
        const g = k => { const key = Object.keys(row).find(x => x.toLowerCase() === k.toLowerCase()); return key ? row[key] : undefined; };
        let asleep = hrs(g("asleep") ?? g("totalSleep") ?? g("total"));
        const stages = hrs((+g("core") || 0) + (+g("deep") || 0) + (+g("rem") || 0));
        if ((!asleep || asleep <= 0) && g("sleepStart") && g("sleepEnd")) { const span = (new Date(g("sleepEnd")) - new Date(g("sleepStart"))) / 3600e3; if (span > 0 && span < 16) asleep = span - (hrs(+g("awake") || 0) || 0); }
        if ((!asleep || asleep <= 0) && stages > 0) asleep = stages;
        if (asleep != null && asleep > 0) rec.sleep = +asleep.toFixed(2);
        if (g("deep") != null) rec.deep = +hrs(+g("deep")).toFixed(2);
        if (g("rem") != null) rec.rem = +hrs(+g("rem")).toFixed(2);
        if (g("core") != null) rec.core = +hrs(+g("core")).toFixed(2);
        if (g("awake") != null) rec.awake = +hrs(+g("awake")).toFixed(2);
        if (g("inBed") != null) rec.inBed = +hrs(+g("inBed")).toFixed(2);
      } else {
        let v = row.qty ?? row.Avg ?? row.avg; if (typeof v !== "number") continue;
        if (k === "weight" && /lb/i.test(m.units || "")) v = v * 0.45359237;
        if (k === "temp" && /F/.test(m.units || "") && v > 60) v = (v - 32) * 5 / 9;
        /* HRV and respiratory rate are measured many times a day; what matters is the overnight reading.
           Keep running sums for the night window and for the rest of the day, so repeated posts accumulate
           instead of the last sample of the day winning. */
        if (k === "hrv" || k === "rr") {
          const ts = String(row.date || ""), hh = /\d{4}-\d{2}-\d{2}[T ](\d{2})/.exec(ts);
          const hour = hh ? +hh[1] : null;
          const night = hour === null ? true : (hour >= 22 || hour < 10);   // undated rows are treated as the day's own value
          const slot = night ? (k + "N") : (k + "D");
          const acc = rec[slot] || (rec[slot] = { n: 0, s: 0 });
          acc.n++; acc.s += v;
          const N = rec[k + "N"], D = rec[k + "D"];
          rec[k] = +((N && N.n ? N.s / N.n : D.s / D.n)).toFixed(1);
          rec[k + "Src"] = (N && N.n) ? "overnight" : "daytime";
          if (N && N.n) rec[k + "Samples"] = N.n;
        } else {
          rec[k] = +v.toFixed(k === "weight" || k === "temp" ? 2 : 1);
        }
        if (k === "weight") latestWeight = { d, v: rec[k] };
      }
      touched++;
    }
  }
  const keys = Object.keys(W).sort(); while (keys.length > 400) delete W[keys.shift()];
  await writeJSON("wellness.json", W);
  if (latestWeight) { const p = await getProfile();
    const jump = Math.abs((p.weight || latestWeight.v) - latestWeight.v);
    if (p.autoWeight !== false && jump >= 0.1 && jump <= 3) {
      await writeJSON("profile.json", { ...p, weight: +latestWeight.v.toFixed(1), weightDate: latestWeight.d }); } }
  return json({ ok: true, points: touched, days: Object.keys(W).length });
}, { allow: r => r.method === "POST" });
