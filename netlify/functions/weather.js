import { json, readJSON, writeJSON, getProfile, stravaToken, strava, gated } from "./_lib.js";
const WMO = { 0:["Clear","☀"],1:["Mostly clear","🌤"],2:["Partly cloudy","⛅"],3:["Overcast","☁"],45:["Fog","🌫"],48:["Freezing fog","🌫"],
  51:["Light drizzle","🌦"],53:["Drizzle","🌦"],55:["Heavy drizzle","🌧"],56:["Freezing drizzle","🌧"],57:["Freezing drizzle","🌧"],
  61:["Light rain","🌦"],63:["Rain","🌧"],65:["Heavy rain","🌧"],66:["Freezing rain","🌧"],67:["Freezing rain","🌧"],
  71:["Light snow","🌨"],73:["Snow","🌨"],75:["Heavy snow","❄"],77:["Snow grains","🌨"],
  80:["Showers","🌦"],81:["Showers","🌧"],82:["Heavy showers","⛈"],85:["Snow showers","🌨"],86:["Snow showers","🌨"],
  95:["Thunderstorms","⛈"],96:["Thunderstorms","⛈"],99:["Thunderstorms","⛈"] };
export const describe = c => WMO[c] || ["—","·"];
/* where the rider rides from: their own setting, else the start of their last ride, else nothing */
async function home(prof) {
  if (prof.home && prof.home.lat) return prof.home;
  try {
    const tok = await stravaToken(); if (!tok) return null;
    const r = await strava("/athlete/activities?per_page=8", tok.access_token); if (!r.ok) return null;
    const withLatLng = (await r.json()).find(a => Array.isArray(a.start_latlng) && a.start_latlng.length === 2);
    if (!withLatLng) return null;
    const h = { lat: +withLatLng.start_latlng[0].toFixed(3), lon: +withLatLng.start_latlng[1].toFixed(3), from: "your last ride" };
    await writeJSON("profile.json", { ...(await getProfile()), home: h });
    return h;
  } catch { return null; }
}
export async function forecast(lat, lon, days = 10) {
  const key = `wx/${lat.toFixed(2)}_${lon.toFixed(2)}_${days}.json`;
  const cached = await readJSON(key);
  if (cached && Date.now() - new Date(cached.at) < 60 * 60e3) return cached.data;   // an hour is plenty
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunrise,sunset` +
    `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
    `&timezone=auto&forecast_days=${Math.min(16, days)}&wind_speed_unit=kmh`;
  const r = await fetch(u);
  if (!r.ok) throw new Error("open-meteo " + r.status);
  const data = await r.json();
  await writeJSON(key, { at: new Date().toISOString(), data });
  return data;
}
/* beyond the forecast horizon, the climate record for that week of the year */
export async function climate(lat, lon, dateISO) {
  const key = `wx/clim_${lat.toFixed(1)}_${lon.toFixed(1)}_${dateISO.slice(5, 7)}.json`;
  const cached = await readJSON(key); if (cached) return cached;
  const y = new Date().getFullYear() - 1, md = dateISO.slice(5);
  const start = `${y - 4}-${md}`, end = `${y}-${md}`;
  const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant&timezone=auto`;
  try {
    const r = await fetch(u); if (!r.ok) return null;
    const d = (await r.json()).daily || {};
    const md2 = md, idx = (d.time || []).map((t, i) => t.slice(5) === md2 ? i : -1).filter(i => i >= 0);
    const pick = arr => idx.length ? +(idx.reduce((a, i) => a + (arr[i] || 0), 0) / idx.length).toFixed(1) : null;
    const out = { tmax: pick(d.temperature_2m_max), tmin: pick(d.temperature_2m_min), rain: pick(d.precipitation_sum),
      wind: pick(d.wind_speed_10m_max), dir: pick(d.wind_direction_10m_dominant), years: idx.length, kind: "climate" };
    await writeJSON(key, out); return out;
  } catch { return null; }
}
export default gated(async (req) => {
  const u = new URL(req.url), prof = await getProfile();
  let lat = +u.searchParams.get("lat"), lon = +u.searchParams.get("lon");
  if (!lat || !lon) { const h = await home(prof); if (!h) return json({ error: "no_location" }, 200); lat = h.lat; lon = h.lon; }
  const date = u.searchParams.get("date");
  if (date) {
    const ahead = Math.ceil((new Date(date) - Date.now()) / 864e5);
    if (ahead <= 15) { const f = await forecast(lat, lon, Math.max(1, Math.min(16, ahead + 1)));
      const i = (f.daily?.time || []).indexOf(date);
      if (i >= 0) return json({ kind: "forecast", lat, lon, day: {
        date, code: f.daily.weather_code[i], tmax: f.daily.temperature_2m_max[i], tmin: f.daily.temperature_2m_min[i],
        feels: f.daily.apparent_temperature_max[i], rain: f.daily.precipitation_sum[i], pop: f.daily.precipitation_probability_max[i],
        wind: f.daily.wind_speed_10m_max[i], gust: f.daily.wind_gusts_10m_max[i], dir: f.daily.wind_direction_10m_dominant[i],
        sunrise: f.daily.sunrise[i], sunset: f.daily.sunset[i] },
        hourly: (f.hourly?.time || []).map((t, k) => ({ t, temp: f.hourly.temperature_2m[k], feels: f.hourly.apparent_temperature[k],
          pop: f.hourly.precipitation_probability[k], code: f.hourly.weather_code[k], wind: f.hourly.wind_speed_10m[k],
          dir: f.hourly.wind_direction_10m[k], gust: f.hourly.wind_gusts_10m[k] })).filter(h => h.t.startsWith(date)) });
    }
    const c = await climate(lat, lon, date);
    return json({ kind: "climate", lat, lon, day: c ? { date, ...c } : null });
  }
  const f = await forecast(lat, lon, 10);
  const days = (f.daily?.time || []).map((t, i) => ({ date: t, code: f.daily.weather_code[i],
    tmax: f.daily.temperature_2m_max[i], tmin: f.daily.temperature_2m_min[i], feels: f.daily.apparent_temperature_max[i],
    rain: f.daily.precipitation_sum[i], pop: f.daily.precipitation_probability_max[i], wind: f.daily.wind_speed_10m_max[i],
    gust: f.daily.wind_gusts_10m_max[i], dir: f.daily.wind_direction_10m_dominant[i], sunrise: f.daily.sunrise[i], sunset: f.daily.sunset[i] }));
  const nowH = (f.hourly?.time || []).findIndex(t => new Date(t) >= new Date(Date.now() - 36e5));
  const now = nowH >= 0 ? { temp: f.hourly.temperature_2m[nowH], feels: f.hourly.apparent_temperature[nowH], code: f.hourly.weather_code[nowH],
    wind: f.hourly.wind_speed_10m[nowH], dir: f.hourly.wind_direction_10m[nowH], gust: f.hourly.wind_gusts_10m[nowH], pop: f.hourly.precipitation_probability[nowH] } : null;
  return json({ kind: "forecast", lat, lon, place: prof.home?.from || null, now, days,
    hourly: (f.hourly?.time || []).map((t, k) => ({ t, temp: f.hourly.temperature_2m[k], pop: f.hourly.precipitation_probability[k],
      wind: f.hourly.wind_speed_10m[k], dir: f.hourly.wind_direction_10m[k], code: f.hourly.weather_code[k] })).slice(0, 72) });
});
