import { readJSON, writeJSON, stravaToken, strava, INTERNAL } from "./_lib.js";
export const config = { schedule: "*/15 * * * *" };
export default async () => {
  const base = process.env.URL, st = await readJSON("state.json", {});
  try {
    const tok = await stravaToken(); if (!tok) throw new Error("no token");
    const r = await strava("/athlete/activities?per_page=5", tok.access_token);
    if (!r.ok) throw new Error("list " + r.status);
    const latest = (await r.json())[0];
    if (!latest) return new Response("nothing");
    const have = await readJSON("activities.json", []);
    const known = have.some(a => a.id === latest.id);
    const m = await readJSON("metrics.json", {});
    const stale = !m.syncedAt || new Date(latest.start_date) > new Date(m.syncedAt);
    if (known && !stale) { await writeJSON("state.json", { ...st, lastCatchup: new Date().toISOString(), lastCatchupDid: "nothing" }); return new Response("current"); }
    /* the same path the webhook uses, so a ride can arrive even if Strava never called us */
    await fetch(`${base}/.netlify/functions/ingest-background`, { method: "POST",
      headers: { "content-type": "application/json", ...INTERNAL() }, body: JSON.stringify({ id: latest.id, aspect: "create" }) });
    await writeJSON("state.json", { ...st, lastCatchup: new Date().toISOString(), lastCatchupDid: "ingested " + latest.id });
    return new Response("ingested " + latest.id);
  } catch (e) {
    await writeJSON("state.json", { ...st, lastCatchup: new Date().toISOString(), lastCatchupError: String(e.message || e) });
    return new Response("error", { status: 500 });
  }
};
