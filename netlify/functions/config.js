import { json, readJSON } from "./_lib.js";
export default async () => {
  const tokens = await readJSON("tokens.json");
  return json({
    connected: !!tokens,
    athlete: tokens?.athlete ? `${tokens.athlete.firstname ?? ""} ${tokens.athlete.lastname ?? ""}`.trim() : null,
    mapboxToken: process.env.MAPBOX_TOKEN || null,
    coach: !!process.env.ANTHROPIC_API_KEY,
    health: !!process.env.HEALTH_INGEST_KEY
  });
};
