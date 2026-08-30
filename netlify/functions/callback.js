import { writeJSON } from "./_lib.js";
export default async (req) => {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  if (!code) return new Response("Missing code", { status: 400 });
  const r = await fetch("https://www.strava.com/oauth/token", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET, code, grant_type: "authorization_code" })});
  if (!r.ok) return new Response("Token exchange failed: " + await r.text(), { status: 502 });
  const t = await r.json();
  await writeJSON("tokens.json", t);
  return new Response(null, { status: 302, headers: { Location: "/?connected=1" } });
};
