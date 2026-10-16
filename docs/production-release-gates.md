# Production release gate — NFL/NBA and Weather Impact

This is a blocking release checklist, not a declaration of readiness. Do not merge or promote the feature branch until every item has dated, independently reviewed evidence.

| Gate | Current evidence | Blocking proof required |
| --- | --- | --- |
| 1. NFL/NBA live data | CI regression workflows green | For a real upcoming game in each sport, compare game ID, schedule, starters, inactive/IR list, status and timestamps against ESPN/NFL/NBA source records; record discrepancies |
| 2. DraftKings/FanDuel markets | Sportsbook verification workflow green | Fetch current public market lines from both books for actual players; prove source timestamp, availability, odds, and book-specific market limits; never synthesize unavailable quotes |
| 3. SGP tiers | NFL SGP regression workflows green | Real pregame end-to-end Small +2000–+3000, Medium +3000–+8000, Nuke +10000+ per supported book; mixed yardage/receptions/TD, starters only, five-yard increments, explain exclusions |
| 4. Refresh scheduling | Vercel crons exist in vercel.json | Confirm real day-before and 30-minute pregame executions for NFL and NBA; inspect logs, stale-data failures, injury invalidation, retry/idempotency; current cron definitions alone do not prove this |
| 5. Weather | Verified-game/NWS advisory modules and tests | Populate NFL_WEATHER_VENUES_JSON with independently checked stadium coordinates/roof/evidence and game mapping; test outdoor NWS request for a real scheduled game; wire verified report into Game Analyzer/public page; confirm no weather-only SGP publishing |
| 6. AI/security | AI Integration workflow green; manual endpoints require secret | Execute authenticated Preview AI review against real snapshot; check malformed payloads, privilege boundaries, public read-only parity, secrets, abuse/rate limits and error handling; verify no writes |
| 7. Deployment and rollback | Vercel feature-branch deployment READY | Smoke-test browser/mobile UI, real API health and source freshness, public picks and history; record rollback target and practice rollback without affecting production |

## Release decision
**BLOCKED** until all seven gates have explicit real-world evidence. Green unit tests and a READY preview build are necessary but insufficient. Never publish fabricated odds or weather-adjusted SGPs. Require explicit owner authorization before production promotion.
