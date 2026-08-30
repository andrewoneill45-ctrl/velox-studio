import { json, readJSON } from "./_lib.js";
export default async () => {
  const tokens = await readJSON("tokens.json");
  const metrics = await readJSON("metrics.json");
  return json({ connected: !!tokens, metrics });
};
