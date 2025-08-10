function toMiles(meters) { return meters / 1609.344; }
function mi(n) { return Number((n).toFixed(1)); }

async function getUserRecord(recordId) {
  const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(
    process.env.AIRTABLE_USERS_TABLE
  )}/${recordId}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` } });
  if (!r.ok) throw new Error(`Airtable get failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function fetchActivities(accessToken, afterEpoch) {
  const url = `https://www.strava.com/api/v3/athlete/activities?after=${afterEpoch}&per_page=200&page=1`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error(`Strava activities failed: ${r.status} ${await r.text()}`);
  return r.json();
}

function computeWeeklyMileageMiles(activities) {
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 3600 * 1000);
  const totalMeters = activities
    .filter(a => new Date(a.start_date) >= fourWeeksAgo)
    .reduce((sum, a) => sum + (a.distance || 0), 0);
  return toMiles(totalMeters) / 4;
}

function planFromWeeklyTargetMiles(targetMi) {
  const longRun = targetMi * 0.32;
  const quality1 = targetMi * 0.18;
  const quality2 = targetMi * 0.14;
  const easyTotal = targetMi - (longRun + quality1 + quality2);
  const easyDay = easyTotal / 3;
  return [
    { day: "Mon", type: "Rest / Mobility", mi: 0 },
    { day: "Tue", type: "Quality (Intervals/Tempo)", mi: mi(quality1) },
    { day: "Wed", type: "Easy Run", mi: mi(easyDay) },
    { day: "Thu", type: "Quality (Tempo/Progression)", mi: mi(quality2) },
    { day: "Fri", type: "Easy Run", mi: mi(easyDay) },
    { day: "Sat", type: "Long Run", mi: mi(longRun) },
    { day: "Sun", type: "Easy Run", mi: mi(easyDay) }
  ];
}

module.exports = async function handler(req, res) {
  try {
    const recordId = req.query?.state;
    if (!recordId) return res.status(400).json({ error: "Missing 'state' (Airtable record id)." });

    const user = await getUserRecord(recordId);
    const token = user?.fields?.strava_access_token;
    if (!token) return res.status(400).json({ error: "User not connected to Strava yet." });

    const after = Math.floor((Date.now() - 30 * 24 * 3600 * 1000) / 1000);
    const activities = await fetchActivities(token, after);

    const weeklyAvgMiles = computeWeeklyMileageMiles(activities);
    const targetMiles = Math.max(10, mi(weeklyAvgMiles * 1.05)); // +5% progression, min 10mi
    const plan = planFromWeeklyTargetMiles(targetMiles);

    res.status(200).json({
      success: true,
      userId: recordId,
      weekly_avg_miles_last_4_weeks: mi(weeklyAvgMiles),
      target_miles_next_week: targetMiles,
      plan
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: String(e.message) });
  }
};
