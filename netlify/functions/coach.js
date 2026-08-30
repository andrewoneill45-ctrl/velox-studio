import { json, readJSON, getProfile } from "./_lib.js";
export default async (req) => {
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "no_key" }, 501);
  const { mode = "weekly", id = null, event = null } = req.method === "POST" ? await req.json() : {};
  const prof = await getProfile();
  const metrics = await readJSON("metrics.json", {});
  let context = { profile: { ftp: prof.ftp, weight: prof.weight, wkg: +(prof.ftp / prof.weight).toFixed(2), targets: prof.tgt } };
  let ask = "";
  if (mode === "debrief" && id) {
    const st = await readJSON(`streams/${id}.json`);
    const meta = (metrics.rideIndex || []).find(r => String(r.id) === String(id));
    context.ride = meta;
    if (st?.watts?.length) {
      const n = st.watts.length, q = k => st.watts.slice(Math.floor(n * k[0]), Math.floor(n * k[1]));
      const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / (a.length || 1));
      context.quarters = [avg(q([0, .25])), avg(q([.25, .5])), avg(q([.5, .75])), avg(q([.75, 1]))];
    }
    ask = "Write a ride debrief in 3–4 short titled sections (Pacing, the key effort, one recommendation). Use the actual numbers.";
  } else if (mode === "recon" && event) {
    context.event = event;
    ask = "Write a 90-word recon briefing for this event: where it will be decided, target watts on the decisive climb, one tactical instruction.";
  } else {
    context.recent = { pmcTail: (metrics.pmc || []).slice(-14), weeks: metrics.weeks, curWeek: metrics.curWeek,
      bests: metrics.bests, tssSeason: metrics.tssSeason, chain: metrics.chain };
    ask = "Write this week's coach note: 90–120 words on current form and exactly what to do this week.";
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6", max_tokens: 700,
      system: "You are the directeur sportif for a single amateur rider. UK English. Confident, warm, specific. Use **bold** for key numbers. No preamble, no sign-off.",
      messages: [{ role: "user", content: ask + "\n\nDATA:\n" + JSON.stringify(context) }] })});
  if (!r.ok) return json({ error: "anthropic_" + r.status, detail: await r.text() }, 502);
  const d = await r.json();
  return json({ text: d.content?.filter(c => c.type === "text").map(c => c.text).join("\n") || "" });
};
