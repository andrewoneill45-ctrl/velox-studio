import { json, readJSON, store, gated } from "./_lib.js";
export default gated(async (req) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return json({ error: "no_id" }, 400);
  const j = await readJSON(`jobs/${id}.json`);
  if (!j) return json({ state: "unknown" }, 404);
  if (j.state === "done") { try { await store().delete(`jobs/${id}.json`); } catch {} }   // collected once, then tidied away
  return json(j);
});
