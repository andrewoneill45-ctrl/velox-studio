import { json, readJSON, getProfile, gated, ftpAtFactory } from "./_lib.js";
export default gated(async (req) => {
  let lite = await readJSON("activities-lite.json");
  if (!lite) {
    const all = await readJSON("activities.json", []);
    const prof = await getProfile(); const FTP = prof.ftp || 180; const ftpAt = ftpAtFactory(prof);
    lite = all.filter(a => /ride/i.test(a.type || "")).map(a => { const NP = a.weighted_average_watts, F = ftpAt(a.start_date);
      return { id: a.id, nm: a.name, d: a.start_date.slice(0, 10), secs: a.moving_time,
        km: +(a.distance / 1000).toFixed(1), m: Math.round(a.total_elevation_gain || 0),
        tss: NP ? Math.round((a.moving_time / 3600) * NP * (NP / F) / F * 100) : Math.round((a.moving_time / 3600) * 55),
        trainer: !!a.trainer }; });
  }
  return json({ activities: lite, count: lite.length });
});
