import { json, readJSON, getProfile, wellnessSummary } from "./_lib.js";
export default async (req) => {
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "no_key" }, 501);
  const body = req.method === "POST" ? await req.json() : {};
  const { mode = "weekly", id = null, event = null, q = null } = body;
  const prof = await getProfile();
  const metrics = await readJSON("metrics.json", {});
  let context = { profile: { ftp: prof.ftp, weight: prof.weight, wkg: +(prof.ftp / prof.weight).toFixed(2), targets: prof.tgt } };
  const libIdx = await readJSON("library-index.json", []);
  let evidence = "";
  for (const x of libIdx.slice(0, 16)) {
    const d = await readJSON(`library/${x.id}.json`); if (!d) continue;
    const add = `• ${d.title} [${d.quality}]: ${d.summary} Protocols: ${(d.protocols || []).join(" | ")}${d.cautions?.length ? " Cautions: " + d.cautions.join(" | ") : ""}
`;
    if (evidence.length + add.length > 9500) break; evidence += add;
  }
  const wl = await wellnessSummary();
  const wellness = wl.latest ? { today: wl.latest, last7: wl.days.slice(-7), readiness: wl.readiness } : null;
  let ask = "";
  if (mode === "readiness") {
    context.wellness = wellness; context.form = (metrics.pmc || []).slice(-1)[0] || null;
    ask = wellness ? "Write this morning's readiness note: three sentences, 60 words maximum. Sentence one: the verdict (train as planned, ease off, or rest). Sentence two: the numbers behind it against baseline. Sentence three: today's session in one line."
                   : "No wellness data is available yet. In one sentence, say the readiness panel is waiting for Apple Health data.";
  }
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
  } else if (mode === "ask" && id) {
    const st = await readJSON(`streams/${id}.json`);
    context.ride = (metrics.rideIndex || []).find(r => String(r.id) === String(id)) || null;
    if (st?.watts?.length) { const n = st.watts.length, sl = k => st.watts.slice(Math.floor(n * k[0]), Math.floor(n * k[1]));
      const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / (a.length || 1));
      context.quarters = [avg(sl([0, .25])), avg(sl([.25, .5])), avg(sl([.5, .75])), avg(sl([.75, 1]))]; }
    ask = `The rider asks about this ride: "${q}". Answer directly and specifically from the data, under 120 words.`;
  } else if (mode === "condition") {
    context.recent = { pmcTail: (metrics.pmc || []).slice(-21), weeks: metrics.weeks, curWeek: metrics.curWeek,
      bests: metrics.bests, tssSeason: metrics.tssSeason, chain: metrics.chain, zones28: metrics.zones28 };
    ask = q ? `The rider asks about their condition: "${q}". Answer directly from the data, under 120 words.`
            : "Give a full condition read from this data: the trend, one risk, and exactly what to do over the next 10 days. 120–150 words, titled short sections.";
  } else if (mode === "planweek") {
    context = body.context || {}; context.wellness = wellness;
    ask = (body.instruction ? `Adjustment from the rider: "${body.instruction}". ` : "") + "Plan this training week from the data.";
  } else if (mode === "recon" && event) {
    context.event = event;
    ask = "Write a 90-word recon briefing for this event: where it will be decided, target watts on the decisive climb, one tactical instruction.";
  } else {
    context.recent = { pmcTail: (metrics.pmc || []).slice(-14), weeks: metrics.weeks, curWeek: metrics.curWeek,
      bests: metrics.bests, tssSeason: metrics.tssSeason, chain: metrics.chain };
    ask = "Write this week's coach note: 70–100 words, four sentences maximum, on current form and exactly what to do this week. Then on a new final line output exactly one machine tag: <viz>{\"weeks\":[{\"label\":\"S22\",\"tss\":412}],\"form\":{\"fitness\":0,\"fatigue\":0,\"tsb\":0},\"eventDays\":0,\"eventName\":\"\"}</viz> filled with the real last 4–5 weeks and current form from the context. Nothing after the tag.";
  }
  if (mode !== "planweek" && mode !== "readiness" && wellness) context.wellness = { readiness: wellness.readiness, today: wellness.today };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6", max_tokens: mode === "weekly" ? 600 : mode === "readiness" ? 200 : mode === "planweek" ? 2400 : 700,
      system: "You are The DS — the directeur sportif for a single amateur rider. UK English. Confident, warm, specific. Write flowing prose in complete sentences: NO headings, NO bullet points, NO numbered lists, NO markdown of any kind except **bold** on the few numbers that matter. Short paragraphs are fine. No preamble, no sign-off."
        + (evidence ? "\n\nEVIDENCE BASE — peer-reviewed findings the rider has curated. Ground your advice in these where relevant and name the source naturally in the prose (e.g. \"the polarised-training work suggests…\"). Do not invent citations.\n" + evidence : "") + (mode === "planweek" ? `
You are now planning ONE training week. Respond with ONLY a JSON object — no prose before or after, no code fences:
{"summary": string (2–3 warm, specific sentences on why this week looks like this, referencing last week and current form),
 "question": string|null (ONLY if one crucial thing is missing; otherwise null),
 "sessions": [{"date":"YYYY-MM-DD","name":string,"type":"Recovery"|"Endurance"|"Tempo"|"Threshold"|"VO2 Max"|"Race"|"Strength","mins":number,"tss":number,"detail":string (max 60 words)}]}
Rules: if wellness.readiness exists, let this morning's readiness shape today and the next two days (Red = rest or very easy, Amber = no intensity today); use only the days listed in week.available and never exceed that day's "mins"; base load on last week's TSS, current form (TSB) and the rider's stated feeling — tired means lower load; place hard days before rest; taper if an A-event is within 10 days; "detail" says exactly how to ride it with watt targets from the rider's FTP and zones. Rest days are simply omitted; if the rider mentions strength work, add "Strength" sessions (tss 15–30) on non-riding days. Keep the whole response under 1500 tokens. Sessions should sum to a sensible weekly TSS (target if given).` : ""),
      messages: [{ role: "user", content: ask + "\n\nDATA:\n" + JSON.stringify(context) }] })});
  if (!r.ok) return json({ error: "anthropic_" + r.status, detail: await r.text() }, 502);
  const d = await r.json();
  const text = d.content?.filter(c => c.type === "text").map(c => c.text).join("\n") || "";
  if (mode === "planweek") {
    try { const clean = text.replace(/```json|```/g, "").trim();
      const plan = JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1));
      return json({ plan, text }); }
    catch { return json({ plan: null, text }); }
  }
  return json({ text });
};
