# One published matchup dataset; connected plugin scope (Phase 1 parity hotfix)

## Automatic production → public flow

1. **Server collector + Momentum/Groq AI** analyze schedule, game-specific rosters, published injury/practice evidence, recent form, offense/defense matchup context and official first-party sportsbook observations.
2. **Eligibility and source-quality gates** reject injured/unverified athlete selections, unsupported sportsbook thresholds, incomplete Small/Medium/Nuke compositions and any invented bookmaker-correlated price.
3. The server writes **one versioned per-game snapshot**. `/api/public-nfl-game?date=...&gameId=...` sanitizes that same saved version and adds `researchSync` metadata with `basis=PUBLISHED_NFL_GAME_SNAPSHOT`, game/date and version.
4. **Both owner and customer research screens read that exact game-scoped public output**, and poll read-only every 30 seconds. A browser-side cached `/api/nfl-markets` reply must not introduce other athletes, lines, predictions or derived combined odds. The owner page may show additional clearly differentiated diagnostic sources.
5. Freshness and eligible-player failures are **NOT READY**, not a hidden fallback to historical models or bookmaker lines. Signed server-side scheduled collection remains responsible for refreshing source data and AI—not public visitors or ChatGPT chat messages.

## Two connected ChatGPT sports plugins

**DraftKings plugin:** available capabilities in ChatGPT include games/scores and current-season team statistics; its currently available actions do **not** provide confirmed exact sportsbook player-prop selections or bookmaker-correlated combined SGP checkout odds. ChatGPT plugin access does **not** install a callable authenticated backend API in a Vercel deployment. DraftKings game/team statistics could be used for advisory cross-verification **after** establishing a permitted, authenticated production data integration.

**Optimal Sports Projections plugin:** allows conversational player-game percentiles, game projections and recent statistics in ChatGPT. It does not turn those estimates into real sportsbook betting lines or correlated SGP prices. Current commercial-use/redistribution authorization has not been established; the dormant server reference endpoint remains disabled (451), with no customer-facing display. Enable only after written rights and secure server-approved credentials/provenance are available. See `docs/optimal-commercial-license-gate.md`.

**Groq/Momentum AI:** existing server-side AI orchestration continues. It can summarize, score and select among already verified eligible candidates and emit model research tiers; it cannot waive injury restrictions, invent offered alt-lines, certify a combined book price, or republish restricted third-party data. Keep data-source timestamp, league, event, player/team identity, market type and license provenance per advisory input.

## Release verification

- Each NFL game must have the same game/date and saved version on both owner/customer displays. The owner should display exactly the published eligible player list and numeric model projections for each category, and the same completed Small/Medium/Nuke leg order.
- Tests cover stale or wrong-game versions, excluded practice/injury listings, stale raw owner cache, unsourced odds, and 30-second read-only synchronized refresh.
- NBA's existing shared snapshot flow retains its own `NBA Owner Public Snapshot Parity` gate; no separate NBA AI model was introduced by this hotfix.
- **Do not claim direct DraftKings/Optimal plugin calls are running inside production.** Those integrations need legitimate server provider access, required licensing and new focused contract tests.
