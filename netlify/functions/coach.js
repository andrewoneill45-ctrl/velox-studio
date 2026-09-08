import { json, readJSON, getProfile, wellnessSummary, gated, writeJSON, INTERNAL } from "./_lib.js";
export async function runCoach(body) {
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "no_key" }, 501);
  const { mode = "weekly", id = null, event = null, q = null } = body;
  const CARDM = ["weekly", "readiness", "debrief", "ask", "condition", "recon", "engine", "session", "jersey"];
  const CARDRULES = `
OUTPUT FORMAT — respond with ONLY this JSON object, no fences, nothing outside it:
{"headline": string (≤16 words, the verdict, second person, plain English),
 "stats": [{"l": string ≤10 chars, "v": string ≤8 chars, "c": "green"|"amber"|"red"|"ink"}] (2-4 chips: only the numbers that matter),
 "points": [{"t": "DO"|"WHY"|"WATCH"|"NEXT", "x": string ≤20 words, key numbers in **bold**}] (2-5, sharpest first),
 "bars": {"title": string ≤24 chars, "items": [{"l": string ≤5 chars, "v": number}]} | null (only when a tiny chart genuinely helps),
 "sessions": [{"date":"YYYY-MM-DD","name":string,"type":"Recovery"|"Endurance"|"Tempo"|"Threshold"|"VO2 Max"|"Race"|"Strength","mins":number,"tss":number,"detail":string ≤40 words with watt targets,"steps": [{"kind":"warmup"|"steady"|"intervals"|"cooldown","mins":number,"pct":number (% of FTP for steady; warmup/cooldown ramp uses pctFrom/pctTo),"pctFrom":number,"pctTo":number,"reps":number,"onMins":number,"onPct":number,"offMins":number,"offPct":number}] (REQUIRED for every ride session — the exact prescription, no prose approximations; Strength sessions may omit)}] | null — include ONLY when the rider asks what to do on a specific day or over a period; use real dates from context.today onwards, respecting readiness,
 "source": string|null (evidence-base titles actually used, comma-separated)}`;

  const prof = await getProfile();
  const metrics = await readJSON("metrics.json", {});
  let context = { profile: { ftp: prof.ftp, weight: prof.weight, wkg: +(prof.ftp / prof.weight).toFixed(2), targets: prof.tgt } };
  const libIdx = await readJSON("library-index.json", []);
  /* the evidence pack is cached: sixteen sequential blob reads on every call was most of the wait */
  let evidence = "";
  const digest = await readJSON("library-digest.json");
  if (digest && digest.n === libIdx.length && digest.text) evidence = digest.text;
  else {
    const docs = await Promise.all(libIdx.slice(0, 16).map(x => readJSON(`library/${x.id}.json`).catch(() => null)));
    for (const d of docs) {
      if (!d) continue;
      const add = `\u2022 ${d.title} [${d.quality}]: ${d.summary} Protocols: ${(d.protocols || []).join(" | ")}${d.cautions?.length ? " Cautions: " + d.cautions.join(" | ") : ""}\n`;
      if (evidence.length + add.length > 9500) break;
      evidence += add;
    }
    await writeJSON("library-digest.json", { n: libIdx.length, at: new Date().toISOString(), text: evidence });
  }
  const wl = await wellnessSummary();
  const wellness = wl.latest ? { today: wl.latest, last7: wl.days.slice(-7), readiness: wl.readiness } : null;
  let ask = "";
  if (mode === "readiness") {
    context.wellness = wellness; context.form = (metrics.pmc || []).slice(-1)[0] || null;
    ask = wellness ? "Fill the card for this morning. headline: train as planned, ease off, or rest — and the one-line why. stats: readiness score (coloured by state), HRV vs baseline, sleep. points: today's exact session or adjustment. bars: null."
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
  } else if (mode === "session") {
    /* one planned session, reworked to the rider's instruction — nothing else */
    const S0 = body.session || {};
    context = { session: S0, date: body.date || null, wellness,
      week: { target: body.weekTarget || null, plannedSoFar: body.weekPlanned || null },
      profile: { ftp: prof.ftp, weight: prof.weight, zones: prof.tgt } };
    ask = `The rider is looking at this planned session and asks for it to be changed: "${q}".

Rework THIS session only. Rules:
- Keep it the same day. Change duration, structure or intensity exactly as asked.
- If they ask for a shorter session, keep the purpose and cut the right part: trim warm-up and cool-down first, then reduce repeats, never turn a threshold session into a spin unless they asked for that.
- Recalculate mins and TSS honestly for what you prescribe.
- Give the full step list with watts (a number, not a range) and seconds for every step, warm-up and cool-down included.
- headline = the new session in one line. points = DO (the session in a sentence), WHY (what you kept and what you dropped, and why).
- Put the replacement in "sessions" as a single entry dated ${body.date || "the same day"} with name, type, mins, tss, detail and steps.
Do not summarise the rider's week, fitness or form.`;
  } else if (mode === "jersey") {
    context = { jersey: body.jersey || {}, wellness };
    ask = `The rider holds the ${body.jersey && body.jersey.name || "jersey"} classification and asks: "${q || "how do I defend it?"}". Answer in two or three sentences about that classification only — what earns points in it, where they stand, and the next ride that would defend or extend it. No general training summary.`;
  } else if (mode === "engine") {
    /* the rider's power, and nothing else: they asked from the FTP card */
    context = { engine: body.engine || {}, wellness };
    ask = `The rider is looking at their FTP and power curve and asks: "${q || "read my engine"}".

Answer THAT question about THEIR power. Rules:
- Use the numbers in ENGINE. Name durations, watts, dates and rides. Never speak generally.
- If eFTP is withholding a suggestion, explain what specific effort would give it something to read, and on which day.
- Where you prescribe, give watts or a % of their current FTP, a duration and a day.
- If their question is about a target, say plainly whether the trend supports it and what rate of gain it needs.
- If the honest answer is that FTP is not their limiter, say so and name what is.
- Do not summarise their training week. Do not give a general condition report.
Fill the card: headline = the answer in one line, stats = the two or three numbers that matter to it, points = DO / WHY / WATCH / NEXT.`;
  } else if (mode === "ask") {
    /* a question with no ride attached: answer the question, do not fall through to the weekly card */
    context.recent = { pmcTail: (metrics.pmc || []).slice(-14), weeks: metrics.weeks, bests: metrics.bests };
    context.extra = body.context || null;
    ask = `The rider asks: "${q}". Answer that question directly from the data, under 140 words. Do not write a general weekly summary unless that is what they asked for.`;
  } else if (mode === "condition") {
    context.recent = { pmcTail: (metrics.pmc || []).slice(-21), weeks: metrics.weeks, curWeek: metrics.curWeek,
      bests: metrics.bests, tssSeason: metrics.tssSeason, chain: metrics.chain, zones28: metrics.zones28 };
    ask = q ? `The rider asks about their condition: "${q}". Answer directly from the data, under 120 words.`
            : "Give a full condition read from this data: the trend, one risk, and exactly what to do over the next 10 days. 120–150 words, titled short sections.";
  } else if (mode === "build") {
    context = body.context || {}; context.wellness = wellness;
    ask = (body.instruction ? `Adjustment from the rider: "${body.instruction}". ` : "") + "Plan the build from today to the goal.";
  } else if (mode === "planweek") {
    context = body.context || {}; context.wellness = wellness;
    ask = (body.instruction ? `Adjustment from the rider: "${body.instruction}". ` : "") + "Plan this training week from the data.";
  } else if (mode === "recon" && event) {
    context.event = event;
    ask = "Write a 90-word recon briefing for this event: where it will be decided, target watts on the decisive climb, one tactical instruction.";
  } else {
    context.recent = { pmcTail: (metrics.pmc || []).slice(-14), weeks: metrics.weeks, curWeek: metrics.curWeek,
      bests: metrics.bests, tssSeason: metrics.tssSeason, chain: metrics.chain };
    ask = "Fill the card for this week's coach note. headline: the verdict on current form. stats: fitness, fatigue, form, and J-days to the event. points: exactly what to do this week with watt targets. bars: the last 4-5 weeks of TSS from context, labels like S24. source: evidence titles you leaned on.";
  }
  if (mode !== "planweek" && mode !== "readiness" && wellness) context.wellness = { readiness: wellness.readiness, today: wellness.today };
  if (CARDM.includes(mode)) { context.today = new Date().toISOString().slice(0, 10);
    context.upcoming = (prof.events || []).filter(e => +new Date(e.date) >= Date.now() - 864e5)
      .map(e => ({ name: e.name, date: e.date, priority: e.pr, days: e.days || 1, kind: e.kind || "day", purpose: e.purpose || null })).slice(0, 4); }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6", max_tokens: mode === "planweek" ? 2400 : mode === "build" ? 3600 : mode === "engine" ? 1100 : mode === "session" ? 1300 : mode === "jersey" ? 500 : CARDM.includes(mode) ? 1400 : 700,
      system: (mode === "build" ? `You are The DS, planning a periodised BUILD from today to a goal for one amateur rider. Respond with ONLY a JSON object, no fences:
{"summary": string (2-3 sentences: the shape of the build and why, naming evidence used),
 "phases": [{"name":"Base"|"Build"|"Specific"|"Trip"|"Recover"|"Taper"|"Event","weeks":number,"focus":string ≤18 words}],
 "weeks": [{"monday":"YYYY-MM-DD","tss":number,"phase":string,"focus":string ≤12 words,"key":string ≤16 words (the one session that defines the week)}],
 "source": string|null}
Rules: weeks must run consecutively from context.thisMonday to the event week inclusive; respect context.otherEvents as fixed load (a trip week's tss must include context.tripLoads for that week and be labelled Trip); recovery week every 3-4 weeks (tss down 35-45%); taper for an A goal in the last 7-14 days per the taper evidence (volume down, intensity kept); a trip with a purpose of enjoyment is prepared for durability and fuelling, not peak power; progress from context.recentWeeks realistically (no week more than ~15% above the recent maximum). ` : "") + "You are The DS — the directeur sportif for a single amateur rider. UK English. Confident, warm, specific. Write flowing prose in complete sentences: NO headings, NO bullet points, NO numbered lists, NO markdown of any kind except **bold** on the few numbers that matter. Short paragraphs are fine. No preamble, no sign-off." + (CARDM.includes(mode) ? CARDRULES : "")
        + (evidence ? "\n\nEVIDENCE BASE — peer-reviewed findings the rider has curated. A multi-day trip is not a race: its purpose (riding with friends, enjoyment, big cols) shapes the build — durability and fuelling over peak power, arrive fresh enough to enjoy every day. Ground your advice in these where relevant and name the source naturally in the prose (e.g. \"the polarised-training work suggests…\"). Do not invent citations.\n" + evidence : "") + (mode === "planweek" ? `
You are now planning ONE training week. Respond with ONLY a JSON object — no prose before or after, no code fences:
{"summary": string (2–3 warm, specific sentences on why this week looks like this, referencing last week and current form),
 "question": string|null (ONLY if one crucial thing is missing; otherwise null),
 "sessions": [{"date":"YYYY-MM-DD","name":string,"type":"Recovery"|"Endurance"|"Tempo"|"Threshold"|"VO2 Max"|"Race"|"Strength","mins":number,"tss":number,"detail":string (max 60 words),"steps": [{"kind":"warmup"|"steady"|"intervals"|"cooldown","mins":number,"pct":number (% of FTP for steady; warmup/cooldown ramp uses pctFrom/pctTo),"pctFrom":number,"pctTo":number,"reps":number,"onMins":number,"onPct":number,"offMins":number,"offPct":number}] (REQUIRED for every ride session — the exact prescription, no prose approximations; Strength sessions may omit)}]}
Rules: if wellness.readiness exists, let this morning's readiness shape today and the next two days (Red = rest or very easy, Amber = no intensity today); use only the days listed in week.available and never exceed that day's "mins"; base load on last week's TSS, current form (TSB) and the rider's stated feeling — tired means lower load; place hard days before rest; taper if an A-event is within 10 days; "detail" says exactly how to ride it with watt targets from the rider's FTP and zones. Rest days are simply omitted; if the rider mentions strength work, add "Strength" sessions (tss 15–30) on non-riding days. Keep the whole response under 1500 tokens. Sessions should sum to a sensible weekly TSS (target if given).` : ""),
      messages: [{ role: "user", content: ask + "\n\nDATA:\n" + JSON.stringify(context) }] })});
  if (!r.ok) return json({ error: "anthropic_" + r.status, detail: await r.text() }, 502);
  const d = await r.json();
  const text = d.content?.filter(c => c.type === "text").map(c => c.text).join("\n") || "";
  if (mode === "build") {
    try { const clean = text.replace(/```json|```/g, "").trim();
      const build = JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1));
      return json({ build, text }); }
    catch { return json({ build: null, text }); }
  }
  if (mode === "planweek") {
    try { const clean = text.replace(/```json|```/g, "").trim();
      const plan = JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1));
      return json({ plan, text }); }
    catch { return json({ plan: null, text }); }
  }
  if (CARDM.includes(mode)) {
    try { const clean = text.replace(/```json|```/g, "").trim();
      const card = JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1));
      if (card && card.headline) return json({ card, text });
    } catch {}
  }
  return json({ text });
}

/* the fast path: short answers still return inline. Long ones are handed to the background. */
const HEAVY = ["planweek", "build"];
export default gated(async (req) => {
  const body = req.method === "POST" ? await req.json() : {};
  if (HEAVY.includes(body.mode) && !body.inline) {
    const job = "j" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    await writeJSON(`jobs/${job}.json`, { state: "running", at: new Date().toISOString(), mode: body.mode });
    const base = process.env.URL;
    /* the dispatch must be awaited: an unawaited fetch can be killed with the invocation */
    let dispatch = null;
    try {
      const r = await fetch(`${base}/.netlify/functions/coach-background`, { method: "POST",
        headers: { "content-type": "application/json", ...INTERNAL() }, body: JSON.stringify({ job, body }) });
      dispatch = r.status;
    } catch (e) { dispatch = "throw: " + String(e.message || e); }
    /* 202 is what a background function returns. Anything else means it never started. */
    if (dispatch !== 202 && dispatch !== 200) {
      await writeJSON(`jobs/${job}.json`, { state: "error", at: new Date().toISOString(),
        error: `the background worker did not start (${dispatch})` });
      return json({ job, state: "error", dispatch });
    }
    await writeJSON(`jobs/${job}.json`, { state: "running", at: new Date().toISOString(), mode: body.mode, dispatch });
    return json({ job, state: "running", dispatch });
  }
  return runCoach(body);
});

