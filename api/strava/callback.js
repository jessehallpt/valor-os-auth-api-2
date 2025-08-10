async function exchangeCodeForTokens(code) {
  const params = new URLSearchParams();
  params.append("client_id", process.env.STRAVA_CLIENT_ID);
  params.append("client_secret", process.env.STRAVA_CLIENT_SECRET);
  params.append("code", code);
  params.append("grant_type", "authorization_code");

  const r = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!r.ok) throw new Error(`Strava token exchange failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function updateAirtableRecord(recordId, fields) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_USERS_TABLE;
  const token = process.env.AIRTABLE_TOKEN;
  if (!baseId || !table || !token) throw new Error("Server not configured (Airtable env vars).");

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${recordId}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`Airtable update failed: ${r.status} ${await r.text()}`);
  return r.json();
}

module.exports = async function handler(req, res) {
  try {
    const code = req.query?.code;
    const state = req.query?.state; // Airtable record id (rec...)
    const err = req.query?.error;

    if (err) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res
        .status(400)
        .send(`<html><body style="font-family:system-ui;padding:24px"><h2>Connection cancelled ❌</h2><p>You can close this tab.</p><p style="color:#666">Error: ${String(err)}</p></body></html>`);
    }

    if (!code || !state) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res
        .status(400)
        .send(`<html><body style="font-family:system-ui;padding:24px"><h2>Connection error</h2><p>Missing 'code' or 'state'.</p></body></html>`);
    }

    const data = await exchangeCodeForTokens(code);
    const fields = {
      strava_athlete_id: data?.athlete?.id || null,
      strava_access_token: data?.access_token || null,
      strava_refresh_token: data?.refresh_token || null,
      strava_token_expires_at: data?.expires_at || null,
      strava_connected_at: new Date().toISOString(),
    };

    await updateAirtableRecord(state, fields);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(`
      <html><body style="font-family:system-ui;padding:24px;text-align:center">
        <h2>Bowerman connected ✅</h2>
        <p>You can close this tab. We’ll pull your runs and generate your weekly plan automatically.</p>
      </body></html>
    `);
  } catch (e) {
    console.error(e);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res
      .status(500)
      .send(`<html><body style="font-family:system-ui;padding:24px"><h2>Connection error</h2><pre>${String(e.message).replace(/</g, "&lt;")}</pre></body></html>`);
  }
};
