# VALOR OS – Strava OAuth (Bowerman)
Serverless endpoints for Strava OAuth and Airtable token storage.

Endpoints
- GET /api/strava/start?state=<airtable_user_id>
- GET /api/strava/callback?code=...&state=...
- GET /api/strava/refresh  (runs daily via cron)

Env Vars
- STRAVA_CLIENT_ID
- STRAVA_CLIENT_SECRET
- AIRTABLE_TOKEN
- AIRTABLE_BASE_ID
- AIRTABLE_USERS_TABLE
