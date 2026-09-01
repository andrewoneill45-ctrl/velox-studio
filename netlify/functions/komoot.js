import { json, gated } from "./_lib.js";
const UA = { "user-agent": "Mozilla/5.0 (Macintosh) VeloX/2.6", "accept": "application/json,text/html" };
export default gated(async (req) => {
  const url = new URL(req.url).searchParams.get("url") || "";
  const idm = url.match(/tour\/(\d+)/); if (!idm) return json({ error: "Not a Komoot tour link" }, 400);
  const id = idm[1], tok = (url.match(/share_token=([\w-]+)/) || [])[1];
  const q = tok ? `?share_token=${tok}` : "";
  let name = "Komoot tour", pts = [];
  try { const r = await fetch(`https://www.komoot.com/api/v007/tours/${id}/coordinates${q}`, { headers: UA });
    if (r.ok) { const d = await r.json(); pts = (d.items || []).map(p => ({ lat: p.lat, lng: p.lng, ele: p.alt })); }
    const r2 = await fetch(`https://www.komoot.com/api/v007/tours/${id}${q}`, { headers: UA });
    if (r2.ok) { const d2 = await r2.json(); if (d2.name) name = d2.name; }
  } catch {}
  if (!pts.length) {
    try { const r = await fetch(`https://www.komoot.com/tour/${id}${q}`, { headers: UA });
      const html = await r.text();
      const nm = html.match(/<title>([^<]*)<\/title>/); if (nm) name = nm[1].replace(/\s*\|.*$/, "").trim() || name;
      const m = html.match(/"coordinates":\{"items":(\[[^\]]*\])/);
      if (m) pts = JSON.parse(m[1]).map(p => ({ lat: p.lat, lng: p.lng, ele: p.alt }));
    } catch {}
  }
  if (!pts.length) return json({ error: "Couldn't read that tour. Make it public or shared by link in Komoot, or export the GPX and drop it here." }, 422);
  return json({ name, pts, source: "komoot", tourId: id });
});
