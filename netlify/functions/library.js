import { json, readJSON, writeJSON, store } from "./_lib.js";
const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "doc";
export default async (req) => {
  const u = new URL(req.url), id = u.searchParams.get("id");
  if (req.method === "GET") {
    if (id) { const d = await readJSON(`library/${id}.json`); return d ? json(d) : json({ error: "not_found" }, 404); }
    return json({ docs: await readJSON("library-index.json", []) });
  }
  const key = u.searchParams.get("key") || req.headers.get("x-velox-key");
  if (!process.env.HEALTH_INGEST_KEY || key !== process.env.HEALTH_INGEST_KEY) return json({ error: "unauthorised" }, 401);
  if (req.method === "DELETE" && id) {
    await store().delete(`library/${id}.json`);
    await writeJSON("library-index.json", (await readJSON("library-index.json", [])).filter(d => d.id !== id));
    return json({ ok: true });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const { title, text } = await req.json();
  if (!title || !text || text.length < 400) return json({ error: "need title and extracted text (400+ chars)" }, 400);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.COACH_MODEL || "claude-sonnet-4-6", max_tokens: 900,
      system: `You distil cycling-training research for a coaching engine. Respond with ONLY JSON, no fences:
{"tags":[3-6 lowercase topic tags e.g. "polarised","ftp","vo2max","recovery","nutrition","taper","strength"],
 "summary": string (max 110 words, the findings that matter for coaching an amateur road cyclist),
 "protocols":[2-5 strings, each one actionable prescription with concrete numbers from the paper],
 "cautions":[0-3 strings, limits of the evidence: population studied, sample size, conflicts],
 "quality":"high"|"medium"|"low" (strength of evidence)}`,
      messages: [{ role: "user", content: `Title: ${title}\n\n${text.slice(0, 55000)}` }] })
  });
  if (!r.ok) return json({ error: "distil_failed", detail: await r.text() }, 502);
  const d = await r.json();
  const raw = d.content?.filter(c => c.type === "text").map(c => c.text).join("") || "";
  let dig; try { const c = raw.replace(/```json|```/g, "").trim(); dig = JSON.parse(c.slice(c.indexOf("{"), c.lastIndexOf("}") + 1)); }
  catch { return json({ error: "parse_failed", raw: raw.slice(0, 200) }, 502); }
  const docId = slug(title);
  const doc = { id: docId, title, ...dig, addedAt: new Date().toISOString() };
  await writeJSON(`library/${docId}.json`, doc);
  const idx = (await readJSON("library-index.json", [])).filter(x => x.id !== docId);
  idx.unshift({ id: docId, title, tags: dig.tags || [], quality: dig.quality || "medium" });
  await writeJSON("library-index.json", idx.slice(0, 100));
  return json({ ok: true, id: docId, tags: dig.tags, quality: dig.quality });
};
