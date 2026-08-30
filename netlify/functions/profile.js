import { json, getProfile, writeJSON } from "./_lib.js";
export default async (req) => {
  if (req.method === "PUT" || req.method === "POST") {
    const body = await req.json();
    const cur = await getProfile();
    const merged = { ...cur, ...body, tgt: { ...cur.tgt, ...(body.tgt || {}) } };
    await writeJSON("profile.json", merged);
    return json({ ok: true, profile: merged });
  }
  return json(await getProfile());
};
