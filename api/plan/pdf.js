const PDFDocument = require("pdfkit");

function toMiles(m) { return m / 1609.344; }
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

function computeWeeklyAvgMilesLast4Weeks(activities) {
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 3600 * 1000);
  const totalMeters = activities
    .filter(a => new Date(a.start_date) >= fourWeeksAgo)
    .reduce((sum, a) => sum + (a.distance || 0), 0);
  return toMiles(totalMeters) / 4;
}

function buildPlan(targetMi) {
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

function renderPdf(res, recordId, summary, plan) {
  const doc = new PDFDocument({ size: "LETTER", margin: 50 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="bowerman-plan-${recordId}.pdf"`);

  doc.pipe(res);

  doc.fontSize(22).text("Bowerman Weekly Plan", { align: "left" }).moveDown(0.5);
  doc.fontSize(12).fillColor("#666").text(new Date().toDateString()).fillColor("#000").moveDown(1);

  doc.fontSize(14).text("Summary", { underline: true }).moveDown(0.5);
  doc.fontSize(12).text(`Weekly avg (last 4 weeks): ${summary.weeklyAvgMi} mi`);
  doc.text(`Target next week: ${summary.targetMi} mi`).moveDown(1);

  doc.fontSize(14).text("Schedule", { underline: true }).moveDown(0.5);
  doc.fontSize(12);
  plan.forEach((p) => {
    doc.text(`${p.day}: ${p.type} — ${p.mi} mi`);
  });

  doc.moveDown(1.5);
  doc.fontSize(10).fillColor("#666").text("Bowerman – VALOR OS", { align: "left" });

  doc.end();
}

module.exports = async function handler(req, res) {
  try {
    const recordId = req.query?.state;
    if (!recordId) return res.status(400).send("Missing 'state' (Airtable record id).");

    const user = await getUserRecord(recordId);
    const accessToken = user?.fields?.strava_access_token;
    if (!accessToken) return res.status(400).send("User not connected to Strava.");

    const after = Math.floor((Date.now() - 30 * 24 * 3600 * 1000) / 1000);
    const acts = await fetchActivities(accessToken, after);

    const weeklyAvg = computeWeeklyAvgMilesLast4Weeks(acts);
    const target = Math.max(10, mi(weeklyAvg * 1.05));
    const plan = buildPlan(target);

    renderPdf(res, recordId, { weeklyAvgMi: mi(weeklyAvg), targetMi: target }, plan);
  } catch (e) {
    console.error(e);
    res.status(500).send(`PDF error: ${String(e.message)}`);
  }
};
