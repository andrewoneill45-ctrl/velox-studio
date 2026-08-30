# VeloX Studio — Live Build

Single-file front end (`site/index.html`), Netlify Functions back end, Netlify Blobs storage.
Data persists across deploys: push code as often as you like, nothing you have synced or set is lost.

## 1 · GitHub

```bash
cd ~/Documents/velox-live        # keep it out of iCloud paths (spaces break npm)
git init
git add -A
git commit -m "VeloX Studio v1"
# create an empty repo named velox-studio on github.com/andrewoneill45-ctrl, then:
git remote add origin git@github.com:andrewoneill45-ctrl/velox-studio.git
git push -u origin main
```

## 2 · Netlify

1. Netlify → Add new site → **Import an existing project** → GitHub → `velox-studio`.
2. Build settings are read from `netlify.toml` (publish `site`, no build command). Deploy.
3. Note your site URL, e.g. `https://velox-studio.netlify.app`. Every future `git push` auto-deploys.

## 3 · Environment variables (Site settings → Environment variables)

| Key | Value |
|---|---|
| `STRAVA_CLIENT_ID` | from strava.com/settings/api |
| `STRAVA_CLIENT_SECRET` | from strava.com/settings/api |
| `STRAVA_VERIFY_TOKEN` | any random string you invent (webhook handshake) |
| `ANTHROPIC_API_KEY` | your Claude API key (server-side only, never shipped to the browser) |
| `ANTHROPIC_MODEL` | optional, defaults to `claude-sonnet-4-6` |
| `MAPBOX_TOKEN` | your Mapbox **public** token (`pk.…`) |

In your **Strava API application** set *Authorization Callback Domain* to your Netlify host
(`velox-studio.netlify.app` — domain only, no protocol or path).

In your **Mapbox account**, restrict the public token's allowed URLs to your Netlify domain.

Redeploy once after adding variables (Deploys → Trigger deploy) so functions pick them up.

## 4 · First run

1. Open the site → **Sources** scene → **RUN SYSTEM CHECK**. Everything except Strava should pass.
2. **CONNECT STRAVA** → approve → you land back connected.
3. **SYNC NOW** → pulls your recent activities, streams for the latest rides with GPS/power,
   computes NP · IF · TSS · VI · decoupling · PMC · zones · season bests, and stores the lot in Blobs.
4. Refresh: the Studio is now running on your real data. The rider profile drawer saves to the
   server on every change, so FTP, weight, targets and events persist.

## 5 · Webhook (optional but recommended)

After the first successful sync, register the webhook so new rides land automatically:

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=YOUR_ID -F client_secret=YOUR_SECRET \
  -F callback_url=https://YOUR-SITE.netlify.app/api/webhook \
  -F verify_token=YOUR_STRAVA_VERIFY_TOKEN
```

## 6 · Local development (optional)

```bash
npm install
npm install -g netlify-cli     # global install; the CLI as a devDependency crashes on Node 25
netlify dev                    # serves site + functions at localhost:8888
```

## What is live vs curated in v1

Live from Strava: rides, streams, maps, NP/IF/TSS/VI/decoupling, PMC, weekly TSS massif,
time-in-zone, season bests, climbing totals, Everest count, consistency chain.
Live from Claude: ride debriefs, weekly coach note, recon briefings.
Curated for now: the 16-stage roadbook and morning readiness (HRV/sleep need the Ultrahuman
and Garmin APIs — a later phase; the panels state their source honestly).
