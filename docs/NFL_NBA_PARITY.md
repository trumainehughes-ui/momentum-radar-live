# Momentum Radar: NFL ↔ NBA parity contract

Status: active development policy as of October 10, 2026.

## Execution priority — October 10, 2026

**Finish and validate the NFL module first. Pause additional NBA feature development.** The NBA foundation, existing tests and shared-safety contract stay in the branch unchanged. Once the NFL data pipeline, SGP verification, injury/starter review, game analyzer, postgame grading and deployment tests meet their release gates, resume NBA development and apply the finalized designs with basketball-specific metrics. Parity is a release goal, **not** a requirement to develop both leagues simultaneously.


**Every NFL feature or safety rule added from this point forward needs an NBA equivalent** when the underlying concept applies to both sports. Do not ship a new parity-dependent AI feature for one sport while claiming the other is complete. Sport-specific stats, roles and market ladders **must not** be forced into an inappropriate NFL convention.

## One product, two leagues

Both sports use:
- The eight registered AI mechanics: Data Quality Guardian, Injury & Opportunity Radar, Prop Value Detector, Parlay Architect, Matchup Intelligence, Game Script Simulator, Breakout & Shadow Radar, and Postgame Learning Lab.
- A direct one-tap game analyzer, active-versus-inactive role checks, player/team/event identity verification, offense versus defense and position-matched defense, recent usage, weather or venue effects **where relevant**, data quality and injury alerts.
- Model-only projections distinct from real sportsbook offers; source- and bookmaker-timestamp verification; 15-minute quote age and conservative response-cache expiration; no sportsbook claims when provider quota is exhausted.
- Small, Medium, and Nuke same-game parlay tiers, a separate strongest-leg-per-game parlay, book-specific DraftKings/FanDuel selection, leg correlation checks and exact combined bookmaker quote verification. Nuke requires **+10,000** or better: a $10 stake returns $1,010 total at exactly +10,000 ($1,000 profit).
- A final player/market verification 30 minutes before kickoff/tipoff, display of last update, completed-game grading, projection calibration and guarded deployments.
- Disabled-by-default AI mechanics, read-only review and no automated betting or publishing until explicit evidence gates pass.

## Sport-specific implementation

| Concept | NFL | NBA |
| --- | --- | --- |
| Prop metrics | Passing/rushing/receiving yards, receptions, anytime TD | Points, rebounds, assists, three-pointers, PRA, supported combos, steals, blocks |
| Player roles | Confirmed starting QB/skill positions | Confirmed starting five and verified active roster; distinguish late lineup news |
| Opponent defense | Pass/run defense, defense vs QB/RB/WR/TE | Team defensive rating/pace, opponent allowance vs PG/SG/SF/PF/C, rebound/assist context |
| Model thresholds | NFL yardage *model alternate thresholds* on five-yard steps | NBA sportsbook half-point lines and actual alternate ladders; **no forced five-yard rounding** |
| Game script | Passing/running environment, weather and dome | Pace, possessions, minutes, rotations, rest/back-to-back |
| Outcomes | Score, passing/rushing/receiving/TD hit rates | Score, minutes, points/rebounds/assists/threes/PRA hit rates |

## Release status (staging only)

- **NFL:** Existing live model path and game interface. New quote-provenance, stale-cache protection and AI guardrails remain on draft PR #3.
- **NBA:** Read-only ESPN game slate API and direct matchup view implemented on the draft branch. League parity registry, NBA game-market review and SportsGameOdds basketball-stat normalization have regression tests. These modules are **not** wired to a live authenticated bookmaker-feed selection pipeline.
- **NBA not ready:** Official starter/injury evidence, verified ESPN↔SGO player IDs from actual games, calibrated offense/defense and minutes model, top-ten boards, book-specific SGP generation, combined bookmaker quote intake, live touchdown-equivalent stat trackers and postgame learning.
- **Both sports:** A model-projected payout is not an actual DraftKings/FanDuel SGP quote. Never mark a book combination verified by multiplying leg prices.
- **Do not enable NBA prop picks or SGPs** before market identity, roster, injury, sport-specific models, calibration and source freshness are satisfied.

## Required regression check for future changes

When editing shared provider quote logic, AI mechanics, parlay tiers, game UI flows, caches, injury/role evidence or release guards, cover **both** NFL and NBA in tests. Run the complete app suite on a nonproduction branch before promotion. Keep all changes on the draft feature branch until production release gates pass.
