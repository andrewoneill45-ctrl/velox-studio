import { readJSON, writeJSON, gateOK } from "./_lib.js";
import { runCoach } from "./coach.js";
export default async (req) => {
  if (!gateOK(req)) return new Response("locked", { status: 401 });
  const { job, body } = await req.json().catch(() => ({}));
  if (!job) return new Response("no job", { status: 400 });
  try {
    const res = await runCoach({ ...body, inline: true });
    const data = await res.json();
    await writeJSON(`jobs/${job}.json`, { state: "done", at: new Date().toISOString(), mode: body.mode, data });
  } catch (e) {
    await writeJSON(`jobs/${job}.json`, { state: "error", at: new Date().toISOString(), error: String(e.message || e) });
  }
  return new Response("ok");
};
