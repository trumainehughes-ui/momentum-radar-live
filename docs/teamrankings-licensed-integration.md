# Optional licensed TeamRankings NFL feed

This integration is **disabled by default**. Do not enable it unless the project has explicit rights to automate access to and use of the data. Public TeamRankings pages are not an authorized JSON feed. No page scraping is implemented.

## Production configuration
In Vercel project `momentum-radar-live`, set:
- `TEAMRANKINGS_LICENSE_CONFIRMED=true` only after obtaining the necessary permission.
- `TEAMRANKINGS_LICENSED_FEED_URL=https://<your-authorized-feed-endpoint>` to a trusted HTTPS JSON endpoint serving the contract below.

Never commit feed credentials, signed URLs, or private endpoints to GitHub. If a feed requires an API key, use a trusted server-side proxy that keeps the secret out of browser requests and logs.

## JSON contract
```json
{
  "season": 2026,
  "updatedAt": "2026-11-08T12:00:00Z",
  "rows": [
    {"team":"BUF","metric":"opponent-passing-yards-per-game","value":210.5},
    {"team":"BUF","metric":"opponent-rushing-yards-per-game","value":105.2}
  ]
}
```
These are **illustrative schema values, not real 2026 statistics**.

The timestamp must be no older than 7 days, must not be more than 60 seconds in the future, and the season must match the requested season. Supported metrics are explicitly whitelisted in `lib/teamrankings-licensed-feed.js`. Unknown metrics and invalid values are ignored.

## Readiness and safety
- `GET /api/nfl-teamrankings-status?season=2026` returns readiness, coverage, and fallback information without exposing the URL or credentials.
- `GET /api/nfl-dvp?season=2026` includes optional team-level metrics.
- `GET /api/nfl-team-tendencies` includes optional metrics per team.
- `GET /api/matchup-research?league=NFL&playerId=...&opponentId=...&stat=rushingYards&dates=YYYYMMDD` includes source-labeled defensive context.
- `npm test` runs Node regression tests on every push via `.github/workflows/node-tests.yml`.

Team-level passing allowance is not receiver-specific coverage. None of these values alone establishes a player hit probability, sportsbook offer, or recommended SGP leg. The SGP engine has not yet been authorized to use this source to adjust picks; ESPN/NFL official evidence and role, injury, weather and book verification remain required.
