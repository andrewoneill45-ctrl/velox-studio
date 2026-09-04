import { json, readJSON, store, gated } from "./_lib.js";
export default gated(async (req) => {
  const [acts, m, wl, st, cards] = await Promise.all([readJSON("activities.json", []), readJSON("metrics.json", {}), readJSON("wellness.json", {}), readJSON("state.json", {}), readJSON("cards.json", {})]);
  const { blobs } = await store().list({ prefix: "streams/" });
  const wk = Object.keys(wl).sort();
  const rides = acts.filter(a => /ride/i.test(a.type || ""));
  return json({ now: new Date().toISOString(),
    lastRide: acts[0]?.start_date || null, lastRideName: acts[0]?.name || null,
    lastCompute: m.syncedAt || null, lastHealth: wk[wk.length - 1] || null,
    lastWebhook: st.lastWebhook || null, lastIngest: st.lastIngest || null,
    lastHandoff: st.lastHandoff || null, lastHandoffAt: st.lastHandoffAt || null,
    lastCatchup: st.lastCatchup || null, lastCatchupDid: st.lastCatchupDid || null, lastCatchupError: st.lastCatchupError || null,
    // a ride "arriving" for more than 15 minutes is a stuck flag, not an arrival
    pending: (st.pending && st.lastWebhook && (Date.now() - new Date(st.lastWebhook)) < 15 * 60e3) ? st.pending : null,
    lastError: st.lastError || null, lastErrorAt: st.lastErrorAt || null,
    lastMorning: st.lastMorning || null, morningCards: cards.morning || null,
    lastUltrahuman: st.lastUltrahuman || null, lastUltrahumanError: st.lastUltrahumanError || null,
    lastMorningError: st.lastMorningError || null, lastMorningTrace: st.lastMorningTrace || null, lastMorningAt: st.lastMorningAt || null,
    streams: (blobs || []).length, rides: rides.length });
});
