async function getUserRecord(recordId) {
  const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(
    process.env.AIRTABLE_USERS_TABLE
  )}/${recordId}`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` }
  });
  if (!r.ok) throw new Error(`Airtable get failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function fetchActivities(accessToken, afterEpoch, perPage = 200, maxPages = 3) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://www.strava.com/api/v3/athlete/activities?after=${afterEpoch}&per_page=${perPage}&page=${page}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!r.ok) throw new Error(`Strava activities failed: ${r.status} ${await r.text()}`);
    const list = await r.json();
    all.push(...list);
    if (list.length < perPage) break; // no more pages
  }
  return all;
}

function toMiles(meters) {
  return meters / 1609.344;
}

module.exports = async function handler(req, res) {
  try {
    const recordId = req.query?.state; // Airtable record id (rec...)
    if (!recordId) return res.status(400).json({ error: "Missing 'state' (Airtable record id)." });

    const user = await getUserRecord(recordId);
    const token = user?.fields?.strava_access_token;
    if (!token) return res.status(400).json({ error: "User has no strava_access_token. Connect first." });

    const days = Number(req.query?.days || 30);
    const after = Math.floor((Date.now() - days * 24 * 3600 * 1000) / 1000);

    const acts = await fetchActivities(token, after);

    // Normalize a subset of fields
    const activities = acts.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type || a.sport_type,
      start_date: a.start_date,
      start_date_local: a.start_date_local,
      distance_m: a.distance,
      distance_mi: Number(toMiles(a.distance).toFixed(2)),
      moving_time_s: a.moving_time,
      elapsed_time_s: a.elapsed_time,
      average_speed_mps: a.average_speed,
      max_speed_mps: a.max_speed,
      average_heartrate: a.average_heartrate ?? null,
      kudos_count: a.kudos_count ?? 0
    }));

    res.status(200).json({
      success: true,
      count: activities.length,
      days,
      activities
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: String(e.message) });
  }
};
