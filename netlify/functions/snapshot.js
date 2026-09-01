import { writeJSON, store } from "./_lib.js";
import { snapshot } from "./backup.js";
export const config = { schedule: "0 3 * * *" };
export default async () => {
  const s = await snapshot(); const day = s.at.slice(0, 10);
  await writeJSON(`backups/${day}.json`, s);
  const { blobs } = await store().list({ prefix: "backups/" });
  const keys = (blobs || []).map(b => b.key).sort();
  while (keys.length > 14) await store().delete(keys.shift());
  return new Response("snapshot " + day);
};
