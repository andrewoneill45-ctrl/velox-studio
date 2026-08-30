import { json, readJSON, writeJSON } from "./_lib.js";
export default async (req) => {
  const u = new URL(req.url);
  if (req.method === "GET") {
    if (u.searchParams.get("hub.verify_token") === process.env.STRAVA_VERIFY_TOKEN)
      return json({ "hub.challenge": u.searchParams.get("hub.challenge") });
    return new Response("verify failed", { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (body?.object_type === "activity") {
    const m = await readJSON("metrics.json", {});
    m.dirty = true; await writeJSON("metrics.json", m); // next visit's sync picks it up
  }
  return json({ ok: true });
};
