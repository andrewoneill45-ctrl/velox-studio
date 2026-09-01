import { readJSON, writeJSON, INTERNAL } from "./_lib.js";
export const config = { schedule: "30 4 * * *" };
export default async () => {
  const base = process.env.URL, st = await readJSON("state.json", {});
  try {
    await fetch(`${base}/api/sync?phase=list`, { headers: INTERNAL() }).catch(() => {});
    await fetch(`${base}/api/sync?phase=compute`, { headers: INTERNAL() });
    const cards = await readJSON("cards.json", {});
    const today = new Date().toISOString().slice(0, 10);
    for (const mode of ["readiness", "weekly"]) {
      try { const r = await fetch(`${base}/api/coach`, { method: "POST", headers: { "content-type": "application/json", ...INTERNAL() }, body: JSON.stringify({ mode }) });
        if (r.ok) { const d = await r.json(); cards[mode] = { date: today, card: d.card || null, text: d.text || "" }; } } catch {}
    }
    cards.morning = today; await writeJSON("cards.json", cards);
    st.lastMorning = new Date().toISOString(); st.lastMorningError = null;
  } catch (e) { st.lastMorningError = String(e.message || e); }
  await writeJSON("state.json", st);
  return new Response("morning done");
};
