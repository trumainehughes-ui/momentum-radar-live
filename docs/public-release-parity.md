# Momentum Radar — Public feature parity release rule

**Every customer-visible capability added or materially changed in the owner/developer Momentum Radar must be evaluated and mirrored in the same release at `/picks`.** The public site is the actual visitor product, not a lightweight promotional landing page.

## Default release contract

1. **One model, two surfaces.** The current sport adapter, predictions, injury gates, SGP rules, model confidence, market evidence, postgame grades and AI-derived explanations are shared. Do not build a separate public probability engine or pretend that data exists when it does not.
2. **Feature parity includes presentation.** When an owner sees a new player category, AI advisor, analytics module, matchup split, screening rule, refreshed data type or grading view, ship its fan-facing read-only view in the same PR and add a public regression test. The front-end can simplify navigation but must preserve the useful details and explanations.
3. **Owner-only boundaries stay owner-only.** The public site never includes editor controls, deployment buttons, API keys, provider outcome IDs, raw diagnostic logs, private query endpoints, AI prompt internals or links to admin tooling. A hidden link is not access control; separately authenticate privileged endpoints before exposing them.
4. **Safe public data** uses existing screened, allowlisted, timestamped saved snapshots. No visitor-triggered Groq/provider credit use, bet placement or production weight changes. Show missing and stale source fields honestly, without inferred sportsbook lines, calibration claims or injury clearances.
5. **Shared Sharp Intelligence rules:** Public Sharp +EV Audit uses the same versioned `lib/ai-mechanics/sharp-engine.js` as the owner. Public saved model statistics alone cannot establish +EV. Require trusted internal market/roster verification and calibrated probabilities to call a bet +EV; otherwise show WAIT or REVIEW and 0 units. New sports inherit these rules automatically after providing validated adapters.
6. **Before merge:** Update public view/API/allowlist where applicable AND public tests. Validate syntax, contract, privacy, stale-book suppression, and published production route with an actual game after Vercel READY. The PR must explicitly state both owner and public effects.

## Scope of readiness

The NFL has prediction and Sharp-audit public data paths. NBA, MLB, and future sport modules must surface corresponding model categories **when reliable saved records and public allowlists exist**; otherwise state "not available yet." Sharing the universal evaluator is not equivalent to claiming those sports already have independent odds feeds or calibrated probability estimates.

## Implementation enforcement

`.github/workflows/public-feature-parity.yml` blocks feature-facing owner changes that do not touch the corresponding public surface and a public contract test. This protects against accidentally updating only the developer dashboard. Exceptions should go through separate owner- and public-impact code changes, not be silently omitted.

Feature delivery may require separate PRs when safety-critical backend work must land first; if so, do not claim the new public feature is released before its mirror is ready.
