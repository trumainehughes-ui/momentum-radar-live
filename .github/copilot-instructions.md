# Momentum Radar — Copilot coding instructions

This repository powers the production Momentum Radar NFL/NBA/MLB prediction service on Vercel. Follow the existing architecture and tests. Do not assert a fix is live until its production endpoint and public UI have been checked.

## Non-negotiable requirements
- The day-before pipeline publishes player-first matchup forecasts, with player full name, category, threshold, opponent offense-versus-defense comparison, and reason. A missing sportsbook offer MUST NOT erase independently supported model research.
- Never present incomplete Small, Medium, or Nuke cards as playable parlays. Separate **MODEL_RESEARCH / NOT BETTABLE** from **VERIFIED_BOOK_SGP**.
- Confirm official injury designations and game-specific starter evidence. Roster membership, depth-chart estimates, and an available injury designation do not independently verify starters. Exclude OUT/inactive; hold questionable/unknown as appropriate.
- DraftKings.com and FanDuel.com public sportsbook pages are primary sources for exact offered player lines and odds. Do not invent lines, prices, or combined SGP quotes. Do not use third-party odds feeds as substitutes for these primary sources.
- Keep owner and public views synchronized to the same game-scoped, timestamped published snapshot; public UI concise and free of internal diagnostics.
- NFL: compare each QB/RB/WR/TE offense usage and production against opposing defensive allowances; use current starters, injury, role, weather, rest and relevant splits. Honor available book thresholds, realistic legs, and separate touchdown/yardage legs.
- NBA Edge Hunter: four legs per research parlay, two players from each of two suitable games, verified starter/role, ten-game history with >=70% last-ten hit rate, supported player markets, no negative correlation. No fabricated offered lines.
- Never mark work complete from passing unit tests alone: validate API, refresh cadence, snapshot persistence, and rendered customer-facing UI.

## Working approach
1. Inspect the real failing game endpoint and latest published snapshot.
2. Trace collection -> injury/role evidence -> model -> persistence -> public projection -> tier readiness.
3. Make the smallest root-cause code fix, with regression tests for the observed failure.
4. Run `npm test` and report counts; avoid weakening safeguards just to pass tests.
5. Open a pull request, verify checks, and only deploy/merge after validation.
6. Confirm live production data and rendered public page after deployment.

Copilot CLI can be launched in a GitHub Codespace terminal with `copilot` if available, or installed with `npm install -g @github/copilot`. The user must authorize Copilot authentication and any required subscription. Do not put tokens in the repository.
