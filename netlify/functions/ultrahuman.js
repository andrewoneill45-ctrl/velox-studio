import { json, readJSON, writeJSON, gated } from "./_lib.js";
const BASE = "https://partner.ultrahuman.com/api/v1";
const iso = d => new Date(d).toISOString().slice(0, 10);
const isNight = ts => { const h = new Date(ts * (String(ts).length > 11 ? 1 : 1000)).getUTCHours(); return h >= 22 || h < 10; };
/* the payload nests differently by account, so walk it and pull what we recognise */
function harvest(payload) {
  const out = { hrvNight: [], hrvAll: [], hr: [], hrNight: [], temp: [], sleep: null, recovery: null, movement: null, vo2: null, steps: null };
  const visit = node => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const type = String(node.type || node.title || node.name || "").toLowerCase();
    const vals = node.object?.values || node.values || node.data;
    if (type.includes("hrv") && Array.isArray(vals)) vals.forEach(v => { const val = +(v.value ?? v.y ?? v); const t = v.timestamp ?? v.time ?? v.x;
      if (val > 0) { out.hrvAll.push(val); if (t && isNight(t)) out.hrvNight.push(val); } });
    if ((type.includes("heart") || type === "hr") && !type.includes("variability") && Array.isArray(vals)) vals.forEach(v => { const val = +(v.value ?? v.y ?? v); const t = v.timestamp ?? v.time ?? v.x;
      if (val > 20) { out.hr.push(val); if (t && isNight(t)) out.hrNight.push(val); } });
    if (type.includes("temp") && Array.isArray(vals)) vals.forEach(v => { const val = +(v.value ?? v.y ?? v); if (val > 20 && val < 45) out.temp.push(val); });
    if (type.includes("sleep")) {
      const s = node.object || node;
      const g = k => s[k] ?? s.summary?.[k] ?? s.metrics?.[k];
      const total = g("total_sleep") ?? g("total") ?? g("duration") ?? g("sleep_duration");
      if (total != null) out.sleep = { total: +total, deep: +(g("deep") ?? g("deep_sleep") ?? 0), rem: +(g("rem") ?? g("rem_sleep") ?? 0),
        light: +(g("light") ?? g("light_sleep") ?? 0), awake: +(g("awake") ?? 0), efficiency: +(g("efficiency") ?? 0) || null,
        score: +(s.score ?? g("sleep_index") ?? g("score") ?? 0) || null };
    }
    if (type.includes("recovery")) out.recovery = +(node.object?.value ?? node.value ?? node.score) || out.recovery;
    if (type.includes("movement")) out.movement = +(node.object?.value ?? node.value ?? node.score) || out.movement;
    if (type.includes("vo2")) out.vo2 = +(node.object?.value ?? node.value) || out.vo2;
    if (type.includes("step")) out.steps = +(node.object?.total ?? node.total ?? node.value) || out.steps;
    Object.values(node).forEach(visit);
  };
  visit(payload);
  return out;
}
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const hrs = v => v > 1000 ? v / 3600 : v > 100 ? v / 60 : v;   // seconds, minutes or hours
export async function pullUltrahuman(days = 3) {
  const tok = process.env.ULTRAHUMAN_TOKEN, email = process.env.ULTRAHUMAN_EMAIL;
  if (!tok || !email) return { ok: false, reason: "not_configured" };
  const W = await readJSON("wellness.json", {});
  const touched = [];
  for (let i = 0; i < days; i++) {
    const day = iso(Date.now() - i * 864e5);
    let r;
    try { r = await fetch(`${BASE}/metrics?email=${encodeURIComponent(email)}&date=${day}`, { headers: { Authorization: tok } }); }
    catch (e) { return { ok: false, reason: String(e.message || e) }; }
    if (!r.ok) return { ok: false, reason: `HTTP ${r.status}`, day };
    const h = harvest(await r.json());
    const rec = { ...(W[day] || {}) };
    const hrvN = mean(h.hrvNight), hrvA = mean(h.hrvAll);
    if (hrvN || hrvA) { rec.hrv = +(hrvN || hrvA).toFixed(1); rec.hrvSrc = hrvN ? "overnight" : "daytime"; rec.hrvSamples = h.hrvNight.length || h.hrvAll.length; }
    const rhr = h.hrNight.length ? Math.min(...h.hrNight) : (h.hr.length ? Math.min(...h.hr) : null);
    if (rhr) rec.rhr = Math.round(rhr);
    if (h.temp.length) rec.temp = +mean(h.temp).toFixed(2);
    if (h.sleep && h.sleep.total) { rec.asleep = +hrs(h.sleep.total).toFixed(2);
      if (h.sleep.deep) rec.deep = +hrs(h.sleep.deep).toFixed(2);
      if (h.sleep.rem) rec.rem = +hrs(h.sleep.rem).toFixed(2);
      if (h.sleep.light) rec.core = +hrs(h.sleep.light).toFixed(2);
      if (h.sleep.awake) rec.awake = +hrs(h.sleep.awake).toFixed(2);
      if (h.sleep.score) rec.sleepScore = h.sleep.score; }
    if (h.recovery) rec.recovery = Math.round(h.recovery);
    if (h.movement) rec.movement = Math.round(h.movement);
    if (h.vo2) rec.vo2 = +h.vo2.toFixed(1);
    if (h.steps) rec.steps = Math.round(h.steps);
    rec.src = "ultrahuman"; rec.at = new Date().toISOString();
    W[day] = rec; touched.push(day);
  }
  await writeJSON("wellness.json", W);
  const st = await readJSON("state.json", {});
  await writeJSON("state.json", { ...st, lastUltrahuman: new Date().toISOString(), lastUltrahumanDays: touched.length });
  return { ok: true, days: touched };
}
export default gated(async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.get("status")) {
    const st = await readJSON("state.json", {});
    return json({ configured: !!(process.env.ULTRAHUMAN_TOKEN && process.env.ULTRAHUMAN_EMAIL),
      lastPull: st.lastUltrahuman || null, lastError: st.lastUltrahumanError || null });
  }
  const days = Math.max(1, Math.min(30, +(u.searchParams.get("days") || 3)));
  const r = await pullUltrahuman(days);
  if (!r.ok) { const st = await readJSON("state.json", {}); await writeJSON("state.json", { ...st, lastUltrahumanError: r.reason }); }
  return json(r);
});
