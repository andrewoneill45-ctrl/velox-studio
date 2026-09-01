import { json, readJSON, writeJSON, INTERNAL } from "./_lib.js";
export default async (req) => {
  const u = new URL(req.url);
  if (req.method === "GET") {
    if (u.searchParams.get("hub.verify_token") === process.env.STRAVA_VERIFY_TOKEN)
      return json({ "hub.challenge": u.searchParams.get("hub.challenge") });
    return new Response("verify failed", { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (body?.object_type === "activity" && (body.aspect_type === "create" || body.aspect_type === "update")) {
    const st = await readJSON("state.json", {});
    st.lastWebhook = new Date().toISOString(); st.pending = body.object_id; await writeJSON("state.json", st);
    const base = process.env.URL || `https://${req.headers.get("host")}`;
    // background function returns 202 immediately; Strava gets its 200 within the two-second window
    try { await fetch(`${base}/.netlify/functions/ingest-background`, { method: "POST", headers: { "content-type": "application/json", ...INTERNAL() },
      body: JSON.stringify({ id: body.object_id, aspect: body.aspect_type }) }); } catch {}
  }
  return json({ ok: true });
};
