import { json, readJSON, getProfile } from "./_lib.js";
export default async () => {
  let lite = await readJSON("activities-lite.json");
  if (!lite) {
    const all = await readJSON("activities.json", []);
    const prof = await getProfile(); const FTP = prof.ftp || 180;
    lite = all.filter(a => /ride/i.test(a.type || "")).map(a => { const NP = a.weighted_average_watts;
      return { id: a.id, nm: a.name, d: a.start_date.slice(0, 10), secs: a.moving_time,
        km: +(a.distance / 1000).toFixed(1), m: Math.round(a.total_elevation_gain || 0),
        tss: NP ? Math.round((a.moving_time / 3600) * NP * (NP / FTP) / FTP * 100) : Math.round((a.moving_time / 3600) * 55),
        trainer: !!a.trainer }; });
  }
  return json({ activities: lite, count: lite.length });
};
