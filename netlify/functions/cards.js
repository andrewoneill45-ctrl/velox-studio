import { json, readJSON } from "./_lib.js";
export default async (req) => {
  const u = new URL(req.url), id = u.searchParams.get("debrief");
  const c = await readJSON("cards.json", {});
  if (id) return json(c.debriefs?.[id] || null);
  return json({ morning: c.morning || null, readiness: c.readiness || null, weekly: c.weekly || null });
};
