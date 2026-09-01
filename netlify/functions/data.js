import { json, readJSON, gated } from "./_lib.js";
export default gated(async (req) => {
  const tokens = await readJSON("tokens.json");
  const metrics = await readJSON("metrics.json");
  return json({ connected: !!tokens, metrics });
});
