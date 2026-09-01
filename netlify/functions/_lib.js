import { createHmac } from "node:crypto";
import { getStore } from "@netlify/blobs";
export const store = () => getStore("velox");
export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
export const readJSON = async (key, fallback = null) => {
  const s = store(); const v = await s.get(key, { type: "json" }); return v ?? fallback;
};
export const writeJSON = (key, val) => store().setJSON(key, val);

export async function stravaToken() {
  const t = await readJSON("tokens.json");
  if (!t) return null;
  if (t.expires_at * 1000 - Date.now() > 60 * 60 * 1000) return t;
  const r = await fetch("https://www.strava.com/oauth/token", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token", refresh_token: t.refresh_token })});
  if (!r.ok) return null;
  const nt = await r.json(); nt.athlete = t.athlete;
  await writeJSON("tokens.json", nt); return nt;
}
export const strava = async (path, token) =>
  fetch("https://www.strava.com/api/v3" + path, { headers: { Authorization: "Bearer " + token } });

export const DEFAULT_PROFILE = {
  ftp: 180, weight: 68, maxhr: 185, rhr: 47, lthr: 168, startFtp: 180, startWeight: 68,
  tgt: { ftp: 300, climb: 60000, sprint: 900, chain: 12 },
  seasonStart: "2026-03-16", weekTargets: {}, plan: {},
  ftpLog: [{ v: 180, d: "1 MAR 26", s: "SEASON BASELINE" }],
  events: []
};
export const getProfile = async () => {
  const p = { ...DEFAULT_PROFILE, ...(await readJSON("profile.json", {})) };
  if (!p.startFtp || p.startFtp === 262) p.startFtp = 180;      // March baseline
  if (!p.startWeight) p.startWeight = 68;                        // March baseline
  if (Array.isArray(p.events) && p.events.length && p.events.every(e => e.id === "marmotte" || e.id === "ventoux")) p.events = [];
  p.ftpLog = (p.ftpLog || []).filter(e => !(e.v === 280 && /2 MAR 26/.test(e.d || "")));
  if (!(p.ftpLog || []).some(e => e.v === 180))
    p.ftpLog = [...(p.ftpLog || []), { v: 180, d: "1 MAR 26", s: "SEASON BASELINE" }];
  return p;
};

/* ── wellness / readiness (Apple Health via Health Auto Export) ── */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function computeReadiness(days) {
  // days: [{d, hrv, rhr, sleep, deep, rem, temp, ...}] ascending by date
  if (!days?.length) return null;
  const today = days[days.length - 1];
  const hist = days.slice(0, -1).slice(-28);
  const stat = k => { const v = hist.map(x => x[k]).filter(x => typeof x === "number"); if (v.length < 3) return null;
    const m = v.reduce((a, b) => a + b, 0) / v.length; const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1; return { m, sd, n: v.length }; };
  const H = stat("hrv"), R = stat("rhr"), T = stat("temp");
  const parts = {}, why = [];
  if (typeof today.hrv === "number" && H) { parts.hrv = clamp(50 + ((today.hrv - H.m) / H.sd) * 20, 0, 100);
    why.push(`HRV ${today.hrv} ms against a ${H.m.toFixed(0)} ms baseline (${H.n} days) → ${Math.round(parts.hrv)}`); }
  else if (typeof today.hrv === "number") why.push("HRV recorded, baseline not yet long enough to score");
  if (typeof today.rhr === "number" && R) { parts.rhr = clamp(50 + ((R.m - today.rhr) / R.sd) * 20, 0, 100);
    why.push(`Resting HR ${today.rhr} against ${R.m.toFixed(0)} baseline → ${Math.round(parts.rhr)}`); }
  if (typeof today.sleep === "number" && today.sleep > 0) { parts.sleep = clamp(today.sleep / 7.5 * 100 - (today.sleep < 6 ? 15 : 0), 0, 100);
    why.push(`Sleep ${today.sleep.toFixed(1)} h against 7.5 h → ${Math.round(parts.sleep)}`);
    if (today.deep || today.rem) { parts.quality = clamp(((today.deep || 0) + (today.rem || 0)) / today.sleep / 0.4 * 100, 0, 100);
      why.push(`Deep+REM ${Math.round(((today.deep || 0) + (today.rem || 0)) / today.sleep * 100)}% of sleep against 40% → ${Math.round(parts.quality)}`); } }
  else why.push("Sleep not recorded: not scored");
  let tempDev = null, penalty = 0;
  if (typeof today.temp === "number" && T) { tempDev = +(today.temp - T.m).toFixed(2); if (Math.abs(tempDev) > 0.5) { penalty = Math.min(20, Math.round((Math.abs(tempDev) - 0.5) * 30)); why.push(`Wrist temperature ${tempDev > 0 ? "+" : ""}${tempDev} °C from baseline → −${penalty}`); } }
  const w = { hrv: .35, rhr: .25, sleep: .25, quality: .15 };
  const keys = Object.keys(parts); if (!keys.length) return null;
  const tw = keys.reduce((s, k) => s + w[k], 0);
  const score = Math.round(clamp(keys.reduce((s, k) => s + parts[k] * w[k], 0) / tw - penalty, 0, 100));
  const state = score >= 75 ? "Feu vert" : score >= 55 ? "Amber" : "Red";
  const advice = score >= 75 ? "CLEARED TO TRAIN" : score >= 55 ? "TRAIN, BUT LISTEN" : "RECOVER TODAY";
  const trend7 = (() => { const v = days.slice(-7).map(x => x.hrv).filter(x => typeof x === "number"); return v.length && H ? +((v.reduce((a, b) => a + b, 0) / v.length) - H.m).toFixed(1) : null; })();
  why.push(`Weighted: HRV 35% · resting HR 25% · sleep 25% · quality 15% (missing parts redistributed) → ${score}`);
  return { score, state, advice, why, parts: Object.fromEntries(keys.map(k => [k, Math.round(parts[k])])), penalty, tempDev,
    baseline: { hrv: H ? +H.m.toFixed(1) : null, rhr: R ? +R.m.toFixed(1) : null, temp: T ? +T.m.toFixed(2) : null, days: H?.n || 0 },
    hrvTrend7: trend7, provisional: !H || H.n < 7, date: today.d };
}
export async function wellnessSummary() {
  const W = await readJSON("wellness.json", {});
  const days = Object.values(W).sort((a, b) => a.d < b.d ? -1 : 1);
  return { days, latest: days[days.length - 1] || null, readiness: computeReadiness(days) };
}


/* ── the gate: one passcode, one signed cookie, internal calls carry the key ── */
export function gateToken() {
  return createHmac("sha256", (process.env.HEALTH_INGEST_KEY || "massif") + ":" + (process.env.SITE_PASSCODE || "")).update("massif-session").digest("hex");
}
export function gateOK(req) {
  if (!process.env.SITE_PASSCODE) return true;
  const k = req.headers.get("x-massif-key"); if (k && process.env.HEALTH_INGEST_KEY && k === process.env.HEALTH_INGEST_KEY) return true;
  const m = (req.headers.get("cookie") || "").match(/massif_session=([a-f0-9]{64})/);
  return !!m && m[1] === gateToken();
}
export const gated = (fn, opts = {}) => async (req) => {
  if (opts.allow && opts.allow(req)) return fn(req);
  if (!gateOK(req)) return json({ error: "locked" }, 401);
  return fn(req);
};
export const INTERNAL = () => ({ "x-massif-key": process.env.HEALTH_INGEST_KEY || "" });
/* FTP in force on a given date, from the rider's log; falls back to the season baseline, then current */
export function ftpAtFactory(prof) {
  const log = (prof.ftpLog || []).filter(e => /^\d{4}-\d{2}-\d{2}/.test(e.date || "") && +(e.ftp ?? e.v) > 0)
    .map(e => ({ d: e.date.slice(0, 10), ftp: +(e.ftp ?? e.v) })).sort((a, b) => a.d < b.d ? -1 : 1);
  return d => { const day = String(d).slice(0, 10); let f = null;
    for (const e of log) { if (e.d <= day) f = e.ftp; else break; }
    return f || prof.startFtp || prof.ftp || 180; };
}
