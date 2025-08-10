module.exports = async function handler(req, res) {
  try {
    const state = req.query?.state; // Airtable record id (rec...)
    if (!state) {
      return res.status(400).send("Missing 'state' (Airtable user_id, rec...).");
    }

    const clientId = process.env.STRAVA_CLIENT_ID;
    if (!clientId) {
      return res.status(500).send("Server not configured (missing STRAVA_CLIENT_ID).");
    }

    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const proto = req.headers["x-forwarded-proto"] || "https";
    const redirectUri = `${proto}://${host}/api/strava/callback`;
    const scope = encodeURIComponent("read,activity:read_all");

    const url =
      `https://www.strava.com/oauth/authorize?client_id=${clientId}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&approval_prompt=auto` +
      `&scope=${scope}` +
      `&state=${encodeURIComponent(state)}`;

    res.writeHead(302, { Location: url });
    res.end();
  } catch (e) {
    console.error(e);
    res.status(500).send("Error starting Strava OAuth.");
  }
};
