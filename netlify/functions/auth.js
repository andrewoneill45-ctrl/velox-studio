export default async (req) => {
  const u = new URL(req.url);
  const redirect = `${u.protocol}//${u.host}/api/callback`;
  const url = "https://www.strava.com/oauth/authorize" +
    `?client_id=${process.env.STRAVA_CLIENT_ID}&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&approval_prompt=auto&scope=read,activity:read_all`;
  return new Response(null, { status: 302, headers: { Location: url } });
};
