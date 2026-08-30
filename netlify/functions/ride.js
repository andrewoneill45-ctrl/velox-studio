import { json, readJSON } from "./_lib.js";
export default async (req) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);
  const st = await readJSON(`streams/${id}.json`);
  if (!st) return json({ error: "no_streams" }, 404);
  const metrics = await readJSON("metrics.json", {});
  const meta = (metrics.rideIndex || []).find(r => String(r.id) === String(id)) || null;
  return json({ id, meta, streams: st });
};
