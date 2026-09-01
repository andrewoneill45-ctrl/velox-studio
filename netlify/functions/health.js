import { json, readJSON, store, stravaToken, gated } from "./_lib.js";
export default gated(async (req) => {
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  const checks = [];
  const add = (name, ok, info = "") => checks.push({ name, ok, info });
  add("Strava client ID", !!process.env.STRAVA_CLIENT_ID);
  add("Strava client secret", !!process.env.STRAVA_CLIENT_SECRET);
  add("Webhook verify token", !!process.env.STRAVA_VERIFY_TOKEN);
  add("Claude API key", !!process.env.ANTHROPIC_API_KEY);
  add("Mapbox token", !!process.env.MAPBOX_TOKEN);
  add("Apple Health ingest key", !!process.env.HEALTH_INGEST_KEY, process.env.HEALTH_INGEST_KEY ? "" : "Set HEALTH_INGEST_KEY to receive Health Auto Export data");
  const wl = await readJSON("wellness.json");
  const wk = wl ? Object.keys(wl).sort() : [];
  add("Apple Health data received", wk.length > 0, wk.length ? `Latest ${wk[wk.length - 1]} · ${wk.length} days` : "No data yet — set up the Health Auto Export automation");
  try { const s = store(); const k = "healthcheck.tmp";
    await s.set(k, "ok"); const v = await s.get(k); await s.delete(k);
    add("Blobs storage read/write", v === "ok");
  } catch (e) { add("Blobs storage read/write", false, String(e.message || e)); }
  try { const t = await stravaToken();
    if (!t) add("Strava connection", false, "Not connected yet — use Connect Strava");
    else { const r = await fetch("https://www.strava.com/api/v3/athlete", { headers: { Authorization: "Bearer " + t.access_token } });
      add("Strava connection", r.ok, r.ok ? `Authenticated as ${(await r.json()).firstname}` : "Token invalid");
    }
  } catch (e) { add("Strava connection", false, String(e.message || e)); }
  const m = await readJSON("metrics.json");
  add("Synced data present", !!m, m ? `Last sync ${m.syncedAt}` : "Run Sync Now after connecting");
  if (deep && process.env.ANTHROPIC_API_KEY) {
    try { const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6", max_tokens: 1, messages: [{ role: "user", content: "ping" }] }) });
      add("Claude API live call", r.ok, r.ok ? "Model responded" : "HTTP " + r.status);
    } catch (e) { add("Claude API live call", false, String(e.message || e)); }
  }
  return json({ ok: checks.every(c => c.ok || c.name === "Strava connection" || c.name === "Synced data present" || c.name === "Apple Health data received"), checks });
});
