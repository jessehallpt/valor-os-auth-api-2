async function assertAuthorized(req, res) {
  const provided =
    req.headers["x-refresh-secret"] ||
    req.query?.secret ||
    req.headers["x-bowerman-secret"];
  const expected = process.env.REFRESH_SECRET;
  if (!expected || provided !== expected) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return false;
  }
  return true;
}

async function listConnectedUsers() {
  const filter = encodeURIComponent(`{strava_access_token} != ""`);
  const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(
    process.env.AIRTABLE_USERS_TABLE
  )}?filterByFormula=${filter}&pageSize=50`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` } });
  if (!r.ok) throw new Error(`Airtable list failed: ${r.status} ${await r.text()}`);
  return r.json();
}

function toMiles(m) { return m / 1609.344; }
function mi(n) { return Number((n).toFixed(1)); }

async function fetchLast30Days(accessToken) {
  const after = Math.floor((Date.now() - 30 * 24 * 3600 * 1000) / 1000);
  const url = `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=200&page=1`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error(`Strava activities failed: ${r.status} ${await r.text()}`);
  return r.json();
}

function computeTargetMiles(acts) {
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 3600 * 1000);
  const totalMeters = acts
    .filter(a => new Date(a.start_date) >= fourWeeksAgo)
    .reduce((sum, a) => sum + (a.distance || 0), 0);
  const weeklyAvg = toMiles(totalMeters) / 4;
  return Math.max(10, mi(weeklyAvg * 1.05));
}

module.exports = async function handler(req, res) {
  try {
    if (!(await assertAuthorized(req, res))) return;

    // Run only on Saturdays UTC unless ?force=true
    const force = String(req.query?.force || "").toLowerCase() === "true";
    const dow = new Date().getUTCDay(); // 0=Sun ... 6=Sat
    if (!force && dow !== 6) {
      return res.status(200).json({ success: true, skipped: true, reason: "Not Saturday (UTC)" });
    }

    const list = await listConnectedUsers();
    const users = list.records || [];
    const results = [];

    for (const u of users) {
      try {
        const token = u.fields?.strava_access_token;
        if (!token) {
          results.push({ userId: u.id, status: "skipped", reason: "No access token" });
          continue;
        }
        const acts = await fetchLast30Days(token);
        const targetMi = computeTargetMiles(acts);

        // Placeholder: here you’d generate a PDF and deliver via email/SMS.
        // For now we just include the target miles in the result.
        results.push({
          userId: u.id,
          status: "ok",
          target_miles_next_week: targetMi
        });
      } catch (e) {
        results.push({ userId: u.id, status: "error", error: String(e.message) });
      }
    }

    res.status(200).json({
      success: true,
      total_users: users.length,
      processed: results.length,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: String(e.message) });
  }
};
