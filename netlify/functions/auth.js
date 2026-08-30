export default async (req) => {
  const u = new URL(req.url);
  const force = u.searchParams.get("force") === "1";
  const redirect = `${u.protocol}//${u.host}/api/callback`;
  const url = "https://www.strava.com/oauth/authorize" +
    `?client_id=${process.env.STRAVA_CLIENT_ID}&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&approval_prompt=${force ? "force" : "auto"}&scope=read,activity:read_all`;
  return new Response(null, { status: 302, headers: { Location: url } });
};
