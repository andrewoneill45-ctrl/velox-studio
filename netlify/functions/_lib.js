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
  seasonStart: "2026-03-16",
  ftpLog: [{ v: 180, d: "1 MAR 26", s: "SEASON BASELINE" }],
  events: [
    { id: "marmotte", name: "La Marmotte Granfondo", short: "LA MARMOTTE", loc: "BOURG D'OISANS",
      date: "2026-07-05", km: 174, m: 5000, pr: "A",
      cols: [{ n: "Col du Glandon", len: 21.3, g: 6.9, top: 1924 }, { n: "Col du Télégraphe", len: 11.9, g: 7.1, top: 1566 },
             { n: "Col du Galibier", len: 18.1, g: 6.9, top: 2642 }, { n: "Alpe d'Huez", len: 13.8, g: 8.1, top: 1850 }] },
    { id: "ventoux", name: "Ventoux Sportive", short: "VENTOUX", loc: "BÉDOIN",
      date: "2026-06-14", km: 118, m: 2900, pr: "B",
      cols: [{ n: "Mont Ventoux — Bédoin", len: 21.4, g: 7.5, top: 1909 }] }
  ]
};
export const getProfile = async () => {
  const p = { ...DEFAULT_PROFILE, ...(await readJSON("profile.json", {})) };
  if (!p.startFtp || p.startFtp === 262) p.startFtp = 180;      // March baseline
  if (!p.startWeight) p.startWeight = 68;                        // March baseline
  if (!(p.ftpLog || []).some(e => e.v === 180))
    p.ftpLog = [...(p.ftpLog || []), { v: 180, d: "1 MAR 26", s: "SEASON BASELINE" }];
  return p;
};
