import { json, getProfile, readJSON, writeJSON, gated } from "./_lib.js";
/* Keys that represent real work by the rider. An incoming save may never blank them:
   if the body omits them, or sends them empty while the store holds something, the store wins.
   Deliberate clearing is possible with ?force=1. */
const PRECIOUS = ["build", "plan", "weekTargets", "events", "ftpLog", "cols"];
const empty = v => v == null || (Array.isArray(v) ? !v.length : (typeof v === "object" ? !Object.keys(v).length : false));
export default gated(async (req) => {
  const u = new URL(req.url);
  if (req.method === "PUT" || req.method === "POST") {
    const body = await req.json();
    const cur = await getProfile();
    const merged = { ...cur, ...body, tgt: { ...cur.tgt, ...(body.tgt || {}) } };
    const kept = [];
    if (u.searchParams.get("force") !== "1") {
      for (const k of PRECIOUS) if (empty(body[k]) && !empty(cur[k])) { merged[k] = cur[k]; kept.push(k); }
    }
    if (JSON.stringify(merged) !== JSON.stringify(cur)) {
      const hist = await readJSON("profile-history.json", []);
      hist.push({ at: new Date().toISOString(), profile: cur });
      while (hist.length > 30) hist.shift();
      await writeJSON("profile-history.json", hist);
    }
    await writeJSON("profile.json", merged);
    return json({ ok: true, profile: merged, kept });
  }
  if (req.method === "GET" && u.searchParams.get("history")) {
    const hist = await readJSON("profile-history.json", []);
    return json({ versions: hist.map((h, i) => ({ i, at: h.at,
      build: Object.keys(h.profile.build || {}).length, weeks: Object.keys(h.profile.weekTargets || {}).length,
      events: (h.profile.events || []).length, sessions: Object.values(h.profile.plan || {}).flat().length })) });
  }
  if (req.method === "PATCH") {                      // restore one earlier version, merged, never destructive
    const { version } = await req.json().catch(() => ({}));
    const hist = await readJSON("profile-history.json", []);
    const v = hist[version]; if (!v) return json({ error: "no such version" }, 404);
    const cur = await getProfile();
    const merged = { ...cur };
    for (const k of PRECIOUS) if (!empty(v.profile[k])) merged[k] = v.profile[k];
    await writeJSON("profile.json", merged);
    return json({ ok: true, restored: v.at, profile: merged });
  }
  return json(await getProfile());
});
