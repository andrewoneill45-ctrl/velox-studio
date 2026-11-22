// Loads Massif's own metric functions from the function sources, unchanged, so the tests exercise the code that ships.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = n => fs.readFileSync(path.join(ROOT, "netlify/functions", n), "utf8");
const block = (src, name) => { const i = src.indexOf("const " + name + " = "); if (i < 0) throw new Error("missing " + name);
  let k = i, d = 0, s = false; for (; k < src.length; k++) { if (src[k] === "{") { d++; s = true; } if (src[k] === "}") { d--; if (s && !d) break; } }
  return src.slice(i, k + 2); };
const sync = F("sync.js"), lib = F("_lib.js");
const cr = lib.slice(lib.indexOf("export const clamp"), lib.indexOf("export async function wellnessSummary")).replace(/export /g, "");
const fa = lib.slice(lib.indexOf("export function ftpAtFactory")).replace(/export /g, "");
export const APP = new Function(["ds", "np", "bestAvg"].map(n => block(sync, n)).join("\n") + "\n" + cr + "\n" + fa +
  "\nreturn {ds,np,bestAvg,computeReadiness,ftpAtFactory};")();
export const SRC = { sync, lib, ride: F("ride.js"), coach: F("coach.js"), webhook: F("webhook.js"), index: fs.readFileSync(path.join(ROOT, "site/index.html"), "utf8") };
/* the PMC step as written in sync.js (compute) and pmcFromActs (index.html) */
export const appPMC = loads => { let c = 0, a = 0; return loads.map(L => { c += (L - c) / 42; a += (L - a) / 7; return { ctl: c, atl: a }; }); };
export const appTSS = (secs, NP, F) => Math.round((secs / 3600) * NP * (NP / F) / F * 100);
