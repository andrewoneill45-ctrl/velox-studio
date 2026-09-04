import { readJSON, writeJSON, gateOK } from "./_lib.js";
import { runCoach } from "./coach.js";
export default async (req) => {
  if (!gateOK(req)) return new Response("locked", { status: 401 });
  const { job, body } = await req.json().catch(() => ({}));
  if (!job) return new Response("no job", { status: 400 });
  const started = Date.now();
  try {
    await writeJSON(`jobs/${job}.json`, { state: "running", at: new Date().toISOString(), mode: body.mode, worker: "started" });
    const res = await runCoach({ ...body, inline: true });
    const data = await res.json();
    await writeJSON(`jobs/${job}.json`, { state: "done", at: new Date().toISOString(), mode: body.mode, secs: Math.round((Date.now() - started) / 1000), data });
    const st = await readJSON("state.json", {});
    await writeJSON("state.json", { ...st, lastCoachJob: { job, mode: body.mode, secs: Math.round((Date.now() - started) / 1000), at: new Date().toISOString() } });
  } catch (e) {
    await writeJSON(`jobs/${job}.json`, { state: "error", at: new Date().toISOString(), error: String(e.message || e) });
    const st = await readJSON("state.json", {});
    await writeJSON("state.json", { ...st, lastCoachJob: { job, mode: body.mode, error: String(e.message || e), at: new Date().toISOString() } });
  }
  return new Response("ok");
};
