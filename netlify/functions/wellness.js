import { json, readJSON, writeJSON, getProfile, wellnessSummary } from "./_lib.js";
const MAP = { heart_rate_variability: "hrv", resting_heart_rate: "rhr", respiratory_rate: "rr",
  apple_sleeping_wrist_temperature: "temp", weight_body_mass: "weight", vo2_max: "vo2",
  sleep_analysis: "sleep", step_count: "steps", blood_oxygen_saturation: "spo2", heart_rate: "hr" };
export default async (req) => {
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
        let asleep = hrs(row.asleep ?? row.totalSleep);
        const stages = hrs((row.core || 0) + (row.deep || 0) + (row.rem || 0));
        if ((!asleep || asleep <= 0) && stages > 0) asleep = stages;
        if (asleep != null && asleep > 0) rec.sleep = +asleep.toFixed(2);
        if (row.deep != null) rec.deep = +hrs(row.deep).toFixed(2);
        if (row.rem != null) rec.rem = +hrs(row.rem).toFixed(2);
        if (row.core != null) rec.core = +hrs(row.core).toFixed(2);
        if (row.awake != null) rec.awake = +hrs(row.awake).toFixed(2);
        if (row.inBed != null) rec.inBed = +hrs(row.inBed).toFixed(2);
      } else {
        let v = row.qty ?? row.Avg ?? row.avg; if (typeof v !== "number") continue;
        if (k === "weight" && /lb/i.test(m.units || "")) v = v * 0.45359237;
        if (k === "temp" && /F/.test(m.units || "") && v > 60) v = (v - 32) * 5 / 9;
        rec[k] = +v.toFixed(k === "weight" || k === "temp" ? 2 : 1);
        if (k === "weight") latestWeight = { d, v: rec[k] };
      }
      touched++;
    }
  }
  const keys = Object.keys(W).sort(); while (keys.length > 400) delete W[keys.shift()];
  await writeJSON("wellness.json", W);
  if (latestWeight) { const p = await getProfile();
    if (p.autoWeight !== false && Math.abs((p.weight || 0) - latestWeight.v) >= 0.1) {
      await writeJSON("profile.json", { ...p, weight: +latestWeight.v.toFixed(1), weightDate: latestWeight.d }); } }
  return json({ ok: true, points: touched, days: Object.keys(W).length });
};
