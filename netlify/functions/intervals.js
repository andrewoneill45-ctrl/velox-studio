import { json, readJSON, writeJSON, getProfile, gated } from "./_lib.js";
const BASE = "https://intervals.icu/api/v1";
const auth = () => "Basic " + Buffer.from("API_KEY:" + (process.env.INTERVALS_KEY || "")).toString("base64");
const aid = () => (process.env.INTERVALS_ATHLETE || "").replace(/^i?/, "i");
/* our session steps → the plain step syntax intervals.icu parses (and the Karoo then follows) */
export function toDoc(sess, ftp) {
  const steps = sess.steps && sess.steps.length ? sess.steps : null;
  const pct = w => Math.max(30, Math.round((w / (ftp || 185)) * 100));
  if (!steps) {
    const mins = +sess.mins || 60, t = (sess.type || "").toLowerCase();
    const z = t.includes("threshold") ? 95 : t.includes("vo2") ? 110 : t.includes("tempo") ? 82 : t.includes("recovery") ? 50 : 65;
    return `Warmup\n- 10m ramp 45-60%\n\n${sess.type || "Main"}\n- ${Math.max(10, mins - 20)}m ${z}%\n\nCooldown\n- 10m 50%`;
  }
  const lines = [];
  for (const s of steps) {
    const mins = Math.max(1, Math.round((+s.secs || +s.mins * 60 || 300) / 60));
    const p = s.pct ? Math.round(s.pct) : pct(+s.w || 0);
    const label = (s.nm || s.name || "").trim();
    if (label) lines.push(label);
    lines.push(`- ${mins}m ${p}%`);
  }
  return lines.join("\n");
}
async function push(days) {
  if (!process.env.INTERVALS_KEY || !process.env.INTERVALS_ATHLETE) return { ok: false, reason: "not_configured" };
  const prof = await getProfile(), plan = prof.plan || {}, ftp = prof.ftp || 185;
  const st = await readJSON("state.json", {}), sent = st.intervalsSent || {};
  const today = new Date(), out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today.getTime() + i * 864e5).toISOString().slice(0, 10);
    const list = plan[d] || [];
    for (let k = 0; k < list.length; k++) {
      const s = list[k], key = `${d}|${k}|${s.nm}`;
      if (sent[key]) continue;                                  // never duplicate a workout on the calendar
      const body = { category: "WORKOUT", start_date_local: d + "T00:00:00", type: "Ride",
        name: `${s.nm} · Massif`, description: toDoc(s, ftp),
        moving_time: Math.round((+s.mins || 60) * 60), icu_training_load: Math.round(+s.tss || 0) || undefined };
      let r;
      try { r = await fetch(`${BASE}/athlete/${aid()}/events`, { method: "POST",
        headers: { "content-type": "application/json", Authorization: auth() }, body: JSON.stringify(body) }); }
      catch (e) { return { ok: false, reason: String(e.message || e), sent: out }; }
      if (!r.ok) return { ok: false, reason: `HTTP ${r.status} ${(await r.text()).slice(0, 120)}`, sent: out };
      const ev = await r.json().catch(() => ({}));
      sent[key] = ev.id || true; out.push({ date: d, name: s.nm });
    }
  }
  await writeJSON("state.json", { ...st, intervalsSent: sent, lastIntervals: new Date().toISOString() });
  return { ok: true, sent: out };
}
export default gated(async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.get("status")) {
    const st = await readJSON("state.json", {});
    return json({ configured: !!(process.env.INTERVALS_KEY && process.env.INTERVALS_ATHLETE),
      lastPush: st.lastIntervals || null, count: Object.keys(st.intervalsSent || {}).length, lastError: st.intervalsError || null });
  }
  if (u.searchParams.get("clear")) { const st = await readJSON("state.json", {}); await writeJSON("state.json", { ...st, intervalsSent: {} }); return json({ ok: true, cleared: true }); }
  const days = Math.max(1, Math.min(60, +(u.searchParams.get("days") || 14)));
  const r = await push(days);
  if (!r.ok) { const st = await readJSON("state.json", {}); await writeJSON("state.json", { ...st, intervalsError: r.reason }); }
  return json(r);
});
