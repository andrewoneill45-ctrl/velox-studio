import { readJSON, writeJSON, INTERNAL } from "./_lib.js";
export const config = { schedule: "30 4 * * *" };
export default async () => {
  const base = process.env.URL, st = await readJSON("state.json", {});
  const trace = [];
  try {
    const r1 = await fetch(`${base}/api/sync?phase=list`, { headers: INTERNAL() }).catch(e => ({ ok: false, status: String(e) }));
    trace.push("list:" + (r1.status || (r1.ok ? "ok" : "fail")));
    const r2 = await fetch(`${base}/api/sync?phase=compute`, { headers: INTERNAL() });
    trace.push("compute:" + r2.status);
    if (!r2.ok) throw new Error("compute " + r2.status);
    const cards = await readJSON("cards.json", {});
    const today = new Date().toISOString().slice(0, 10);
    for (const mode of ["readiness", "weekly"]) {
      try { const r = await fetch(`${base}/api/coach`, { method: "POST", headers: { "content-type": "application/json", ...INTERNAL() }, body: JSON.stringify({ mode }) });
        trace.push(mode + ":" + r.status);
        if (r.ok) { const d = await r.json(); cards[mode] = { date: today, card: d.card || null, text: d.text || "" }; } } catch (e) { trace.push(mode + ":" + String(e.message || e)); }
    }
    cards.morning = today; await writeJSON("cards.json", cards);
    st.lastMorning = new Date().toISOString(); st.lastMorningError = null; st.lastMorningTrace = trace.join(" ");
  } catch (e) { st.lastMorningError = String(e.message || e); st.lastMorningAt = new Date().toISOString(); st.lastMorningTrace = trace.join(" "); }
  await writeJSON("state.json", st);
  return new Response("morning done");
};
