# NBA.com ingestion spike (isolated from production)

This branch contains a **read-only connectivity probe**, not a production collector.

## Local smoke test
Python 3.10+:
```bash
python -m pip install "nba_api==1.11.4"
python scripts/nba_com_probe.py --probe
```

The probe makes one NBA Live ScoreBoard request with a 12-second timeout and emits
JSON with an explicit `productionReady:false` status. It does not expose an API
route, write to storage, modify betting lines, or affect the public website.

## Before production integration
1. Confirm NBA.com data-use rights for this commercial-facing use case.
2. Verify actual NBA.com Stats endpoint availability from the intended hosting
   environment, respecting rate limits and access controls.
3. Build an allowlisted, cached and bounded collector for team/player stats,
   with stable NBA IDs and season/game identifiers.
4. Cross-check ESPN game/roster/injury evidence; model injuries and trades as
   dated events rather than inferring them from missing players.
5. Derive team-defense and position-based allowances from verified data with
   sample sizes and pace adjustments. Do not confuse opponent position with
   actual defensive assignments.
6. Add contract tests, schema drift tests, freshness checks, and historical
   parity tests before connecting NBA SGP generation.
7. Keep sportsbook alternate thresholds and correlated SGP prices independently
   verified from each sportsbook. Never treat model estimates as offered bets.

No API keys or new Vercel environment variables are needed for this probe.
