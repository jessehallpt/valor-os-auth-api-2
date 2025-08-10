async function refreshOne(user) {
  const params = new URLSearchParams();
  params.append("client_id", process.env.STRAVA_CLIENT_ID);
  params.append("client_secret", process.env.STRAVA_CLIENT_SECRET);
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", user.fields.strava_refresh_token);

  const r = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!r.ok) throw new Error(`Strava refresh failed: ${r.status} ${await r.text()}`);
  const data = await r.json();

  const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(
    process.env.AIRTABLE_USERS_TABLE
  )}/${user.id}`;

  const patch = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        strava_access_token: data.access_token,
        strava_refresh_token: data.refresh_token,
        strava_token_expires_at: data.expires_at,
        strava_token_refreshed_at: new Date().toISOString(),
      },
    }),
  });
  if (!patch.ok) throw new Error(`Airtable patch failed: ${patch.status} ${await patch.text()}`);
}

module.exports = async function handler(req, res) {
  try {
    const baseId = process.env.AIRTABLE_BASE_ID;
    const table = process.env.AIRTABLE_USERS_TABLE;
    const token = process.env.AIRTABLE_TOKEN;
    if (!baseId || !table || !token) {
      return res.status(500).json({ error: "Server not configured (Airtable env vars)." });
    }

    const now = Math.floor(Date.now() / 1000);
    const soon = now + 24 * 3600;
    const filter = encodeURIComponent(`{strava_token_expires_at} < ${soon}`);

    const listUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?filterByFormula=${filter}&pageSize=50`;
    const r = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Airtable list failed: ${r.status} ${await r.text()}`);
    const list = await r.json();
    const users = list.records || [];

    const result = { total: users.length, refreshed: 0, errors: 0, details: [] };
    for (const user of users) {
      if (user.fields?.strava_refresh_token) {
        try {
          await refreshOne(user);
          result.refreshed++;
          result.details.push({ userId: user.id, status: "ok" });
        } catch (e) {
          result.errors++;
          result.details.push({ userId: user.id, status: "error", error: String(e.message) });
        }
      } else {
        result.details.push({ userId: user.id, status: "skipped", error: "No refresh token" });
      }
    }

    return res.status(200).json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: String(e.message) });
  }
};
