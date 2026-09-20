import { json, readJSON, stravaToken, strava, gated } from "./_lib.js";
/* one call that walks every link in the chain and says which one is broken */
export default gated(async () => {
  const out = { at: new Date().toISOString(), steps: [] };
  const step = (name, ok, detail) => out.steps.push({ name, ok, detail });
  const st = await readJSON("state.json", {});
  const m = await readJSON("metrics.json", {});
  const acts = await readJSON("activities.json", []);
  step("token", true, "checking Strava token…");
  let tok = null;
  try { tok = await stravaToken(); } catch (e) { step("token", false, "token refresh threw: " + String(e.message || e)); }
  if (tok) {
    out.steps[out.steps.length - 1] = { name: "token", ok: true, detail: "Strava token valid, expires " + (tok.expires_at ? new Date(tok.expires_at * 1000).toISOString() : "unknown") };
    try {
      const r = await strava("/athlete/activities?per_page=3", tok.access_token);
      const lim = r.headers.get("x-ratelimit-usage") || "";
      if (r.ok) { const list = await r.json(); const latest = list[0];
        const known = latest && acts.some(a => a.id === latest.id);
        step("strava", true, `Strava answers · latest activity ${latest ? latest.name + " (" + latest.start_date.slice(0, 16) + ")" : "none"} · rate usage ${lim || "n/a"}`);
        step("known", !!known, latest ? (known ? "that ride is already in Massif" : "that ride is NOT in Massif yet — the pipeline dropped it") : "no rides on Strava");
      } else step("strava", false, `Strava returned ${r.status}` + (r.status === 401 ? " — reconnect Strava" : r.status === 429 ? " — rate limited" : ""));
    } catch (e) { step("strava", false, "request threw: " + String(e.message || e)); }
  }
  step("webhook", !!st.lastWebhook, st.lastWebhook ? "last Strava call " + st.lastWebhook + " · hand-off " + (st.lastHandoff || "?") : "Strava has never called the webhook — check the subscription points at this domain");
  step("catchup", !!st.lastCatchup, st.lastCatchup ? "last catch-up " + st.lastCatchup + " · " + (st.lastCatchupDid || "") + (st.lastCatchupError ? " · error: " + st.lastCatchupError : "") : "the 15-minute catch-up has never run — scheduled functions may not be deploying");
  step("morning", !!st.lastMorning, st.lastMorning ? "last morning " + st.lastMorning + (st.lastMorningError ? " · error: " + st.lastMorningError : "") : "the morning has never run");
  step("compute", !!m.syncedAt, m.syncedAt ? "last compute " + m.syncedAt : "never computed");
  const wl = await readJSON("wellness.json", {}); const days = Object.keys(wl).sort(); const last = days[days.length - 1];
  const age = last ? Math.round((Date.now() - new Date(last)) / 864e5) : null;
  step("health", !!last && age <= 1, last ? `last Apple Health record ${last} (${age} day${age === 1 ? "" : "s"} old) · fields: ${Object.keys(wl[last] || {}).slice(0, 8).join(", ")}` : "no Apple Health data has ever arrived — the export URL or key is wrong");
  step("healthkey", !!process.env.HEALTH_INGEST_KEY, process.env.HEALTH_INGEST_KEY ? "HEALTH_INGEST_KEY is set" : "HEALTH_INGEST_KEY is NOT set — every Health Auto Export post is being refused");
  return json(out);
});
