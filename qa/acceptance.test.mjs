// Massif acceptance suite. Run: node --test qa/
// Tests marked { todo } document a defect from the November 2026 acceptance test (IDs match the report). They report but do not fail the run;
// when a fix lands, remove the todo flag so the check guards against regression.
import { test } from "node:test";
import assert from "node:assert/strict";
import { APP, SRC, appPMC, appTSS } from "./extract.mjs";

const near = (a, b, pct = 0.5) => Math.abs(a - b) <= Math.abs(b) * pct / 100;
const secs = n => Array.from({ length: n }, (_, i) => i);
const stored = p => ({ w: APP.ds(p, 1100), t: APP.ds(secs(p.length), 1100) });   // what sync.js writes to Blobs
// Independent reference values, from qa/reference.py (Coggan/Allen definitions, 1 Hz)
const mmp = (p, d) => { let s = 0, b = 0; for (let i = 0; i < p.length; i++) { s += p[i]; if (i >= d) s -= p[i - d]; if (i >= d - 1) b = Math.max(b, s); } return b / d; };
const npRef = p => { const r = []; let s = 0; for (let i = 0; i < p.length; i++) { s += p[i]; if (i >= 30) s -= p[i - 30]; if (i >= 29) r.push(s / 30); }
  return (r.reduce((a, v) => a + v ** 4, 0) / r.length) ** 0.25; };
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const const185 = Array(3600).fill(185), split = [...Array(1800).fill(250), ...Array(1800).fill(120)];
const long5h = Array.from({ length: 18000 }, (_, i) => (i >= 7200 && i < 7215) ? 820 : rnd() < 0.1 ? 0 : Math.round(170 + (rnd() - 0.5) * 40));

test("G1 constant 185 W for 60 min at FTP 185: NP 185, IF 1.00, TSS 100", () => {
  const { w, t } = stored(const185); const NP = APP.np(w, t);
  assert.equal(NP, 185); assert.equal(+(NP / 185).toFixed(2), 1); assert.equal(appTSS(3600, NP, 185), 100);
});
test("G2 30 min 250 W + 30 min 120 W: NP within 0.5% of reference", () => {
  const { w, t } = stored(split); assert.ok(near(APP.np(w, t), npRef(split)));
});
test("G3 NP on a 5 h ride is within 0.5% of the 1 Hz reference (D-01)", { todo: "streams are decimated to 1,100 points before NP" }, () => {
  const { w, t } = stored(long5h); assert.ok(near(APP.np(w, t), npRef(long5h)), `${APP.np(w, t)} vs ${npRef(long5h).toFixed(1)}`);
});
test("G4 best 5 s power is not zero on a 60 min ride (D-02)", { todo: "5 s window is shorter than the stored sample spacing" }, () => {
  const { w, t } = stored(const185); assert.equal(APP.bestAvg(w, t, 5), 185);
});
test("G5 best 60 min is not overstated by accepting 94% windows (D-03)", { todo: "window accepted at 0.94 x duration" }, () => {
  const p = split.map((_, i) => i); assert.ok(near(APP.bestAvg(split, p, 3600), mmp(split, 3600)));
});
test("G6 CTL after 42 days of 100 TSS: 63.6 (TrainingPeaks 1/42 form) and the form is stated in the UI (D-12)", { todo: "method not stated" }, () => {
  assert.ok(near(appPMC(Array(42).fill(100)).at(-1).ctl, 63.65));
  assert.match(SRC.index, /exponentially weighted|time constant of 42/i);
});
test("G7 TSB is CTL minus ATL in the server and the client", () => {
  assert.match(SRC.sync, /tsb: \+\(ctl - atl\)/); assert.match(SRC.index, /tsb:\+\(ctl-atl\)/);
});
test("G8 one FTP for one ride: ride.js and sync.js use the same dated FTP (D-04)", { todo: "ride.js uses current FTP, sync.js uses ftpAt" }, () => {
  assert.doesNotMatch(SRC.ride, /iff: NP \? \+\(NP \/ FTP\)/);
});
test("G9 a manually logged FTP is honoured by the dated FTP lookup (D-05)", { todo: "manual log writes {v,d:'22 NOV 26'}, lookup needs {date}" }, () => {
  const ftpAt = APP.ftpAtFactory({ startFtp: 180, ftp: 185, ftpLog: [{ v: 185, d: "1 OCT 26", s: "MANUAL" }] });
  assert.equal(ftpAt("2026-11-20"), 185);
});
test("G10 a no-power ride is not given a flat 55 TSS per hour (D-06)", { todo: "no HR-based load model" }, () => {
  assert.doesNotMatch(SRC.sync, /\* 55\)/);
});
const base = Array.from({ length: 28 }, (_, i) => ({ d: `2026-10-${String(i + 1).padStart(2, "0")}`, hrv: 60 + (i % 5), rhr: 48 + (i % 3), sleep: 7.2 }));
test("R1 readiness never says 'cleared to train' when today's HRV is missing (D-07)", { todo: "missing parts are redistributed" }, () => {
  const r = APP.computeReadiness([...base, { d: "2026-11-22", rhr: 47, sleep: 8.4 }]);
  assert.ok(r.provisional || r.advice !== "CLEARED TO TRAIN", JSON.stringify(r.parts) + " -> " + r.advice);
});
test("R2 an HRV crash with raised resting HR reads red", () => {
  const r = APP.computeReadiness([...base, { d: "2026-11-22", hrv: 40, rhr: 56, sleep: 9.5 }]); assert.equal(r.state, "Red");
});
test("R3 readiness shows its inputs and baseline window", () => {
  const r = APP.computeReadiness([...base, { d: "2026-11-22", hrv: 62, rhr: 48, sleep: 7.5 }]);
  assert.ok(r.why.length >= 3); assert.equal(r.baseline.days, 28);
});
test("S1 the coach is told that activity titles and rider text are data, not instructions (D-15)", { todo: "no injection boundary" }, () => {
  assert.match(SRC.coach, /not instructions|untrusted/i);
});
test("S2 the coach has a medical stop rule for chest pain, fainting and breathlessness (D-14)", { todo: "safety_guardrails.md not in the prompt" }, () => {
  assert.match(SRC.coach, /chest pain/i);
});
test("S3 the webhook ignores events for other athletes or subscriptions (D-17)", { todo: "no owner or subscription check" }, () => {
  assert.match(SRC.webhook, /owner_id|subscription_id/);
});
test("K1 no Karoo copy outside history (D-10)", { todo: "Karoo copy and 'Send to Karoo' buttons remain" }, () => {
  assert.doesNotMatch(SRC.index, /SEND TO KAROO|Send to Karoo/);
});
test("U1 the API key never reaches the browser", () => {
  assert.doesNotMatch(SRC.index, /sk-ant-|ANTHROPIC_API_KEY|x-api-key/);
});
