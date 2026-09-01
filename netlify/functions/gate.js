import { json, gateToken } from "./_lib.js";
export default async (req) => {
  if (!process.env.SITE_PASSCODE) return json({ ok: true, open: true });
  if (req.method === "DELETE") return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json", "set-cookie": "massif_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" } });
  if (req.method !== "POST") return json({ ok: false }, 405);
  const { code } = await req.json().catch(() => ({}));
  if (!code || code !== process.env.SITE_PASSCODE) { await new Promise(r => setTimeout(r, 800)); return json({ ok: false }, 401); }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json",
    "set-cookie": `massif_session=${gateToken()}; Path=/; Max-Age=15552000; HttpOnly; Secure; SameSite=Lax` } });
};
