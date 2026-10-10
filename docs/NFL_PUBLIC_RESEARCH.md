# NFL official sportsbook page discovery (preview only)

## What this adds

Momentum Radar can optionally use Brave's documented Web Search API to **discover** indexed player-market pages on the official DraftKings and FanDuel sportsbook domains. The existing Groq-powered **Player & market research** tab provides the player identity, the exact requested stat market and a source-specific search plan. The user must explicitly press **Search official sportsbook pages**; no browser request fires automatically on game loading, refreshes, timers, or AI explanation runs.

The feature does **not** scrape bookmaker pages, extract prices from web snippets, confirm geolocation, authenticate to a sportsbook or obtain a book-issued combined same-game parlay quote. It cannot label web results as offered props. Actual bookmaker lines must still come through the existing independent, current, source-qualified provider and roster gates.

## Vercel preview environment

Both values are required **server-side**:

- `NFL_PUBLIC_WEB_SEARCH_ENABLED=true`
- `BRAVE_SEARCH_API_KEY=<your Brave Web Search API subscription token>`
- `UPSTASH_REDIS_REST_URL=<HTTPS REST endpoint from Upstash Redis>`
- `UPSTASH_REDIS_REST_TOKEN=<write-enabled Upstash Redis REST token>`

Leave the flag off in Production until an authenticated, budgeted workflow has been reviewed. Never put the subscription token in `public-ai.js`, URLs, commits, logs, or response bodies. Set the key in Vercel's **Preview** environment for the target branch, then redeploy that preview after changing environment variables.

Obtain the key from the Brave Search API dashboard and ensure the Web Search product is active. Brave documents `GET https://api.search.brave.com/res/v1/web/search` and the `X-Subscription-Token` header:
https://api-dashboard.search.brave.com/app/documentation/web-search

When the Preview flag, Brave key or shared Redis credentials are missing, the endpoint returns `search_disabled`, `search_not_configured` or `search_budget_unconfigured`. The Groq research queue still works without any Brave API call. `GET /api/nfl-public-market-status` reports `DISABLED`, `MISSING_KEY`, `MISSING_SHARED_BUDGET`, or `READY_RESEARCH_ONLY`, never credentials. The research panel disables the search button until all settings are configured. A configured state is not proof that Redis/Brave will be reachable; the actual search fails closed on a connection error.

## Budget and safety

- Each user click requests **one** player, one bookmaker and one prop market (not an entire slate).
- A **shared Upstash Redis atomic EVAL reservation** must succeed before any uncached upstream Brave call. The shared fixed-window ceiling is **40 searches per hour globally** and **10 per hour per hashed client** across Vercel instances. Hour keys expire automatically; raw client IPs and API credentials are not stored as Redis keys. If Redis is missing, unreachable, malformed, or has an authorization failure, no paid Brave search is attempted. These are hard caps on **attempts**, not guarantees of a successful indexed result.
- The existing second-level warm-instance cap remains 20/hour; simultaneous identical player/market/book lookups on the same warm instance share one upstream request; cached results can be reused for ten minutes with the correct book/player/game/market. Failures are not cached. Duplicate requests on **different** Vercel instances can still consume more than one shared-budget unit; they cannot breach the atomic global cap. Only enable Preview after reviewing the Redis instance’s own spending/usage plan.
- Queries are server-built from bounded player/team/market values. No arbitrary URL is fetched.
- Only indexed links with **HTTPS and an exact** `sportsbook.draftkings.com` or `sportsbook.fanduel.com` hostname are returned; untrusted result hosts are rejected. This validates the provided search-result URL, **not** what a bookmaker website may redirect to later.
- Indexed links must additionally contain an apparent **full player-name mention** in the title, description or URL path. An unrelated generic sportsbook result is discarded; relevant results are sorted ahead when the **requested prop type** is mentioned. A match based only on indexed text or the player's URL path is an investigation lead, **not** verification of the ESPN player ID, participating team, selected game, offered prop threshold, source quote timestamp, or +/− odds. Player-only links clearly say the requested market is unconfirmed.
- Search-result query parameters never count as player-identity evidence. Truncated index excerpts, abbreviated names or unindexed legitimate bookmaker pages may be filtered out; no result does **not** mean the prop is unavailable.
- The output has no verified line, sportsbook price, source-quote timestamp, or correlated SGP odds. Indexed snippets can be outdated, regionalized or unavailable when opened.
- The search results are never fed into the `/api/nfl-markets` selection path or the `releaseReadiness` gate.

## Verification

Run `npm test`, including `tests/ai-nfl-public-market-search.test.js`, `tests/ai-nfl-search-broker.test.js`, `tests/ai-nfl-public-market-status.test.js`, `tests/ai-nfl-shared-search-budget.test.js` and `tests/ai-nfl-indexed-page-relevance.test.js`, then test the preview with:

1. Select an NFL game, open AI Analysis and choose **Player & market research**.
2. Generate the research queue and choose a player and DraftKings or FanDuel.
3. Press **Search official sportsbook pages**, and check that official-site links appear with the not-live-odds disclosure.
4. Confirm a missing search configuration yields a clear message, not made-up odds.
5. Check independent injury/starter gates and Small/Medium/Nuke tier rules remain unchanged.

**Next release steps:** provide the Preview-only Brave and Upstash connections, test a real single-player lookup without disclosing credentials, capture approved live player quotes with original source timestamps and exact player/game/market IDs, and independently verify actual combined SGP odds. Groq summaries and Brave search snippets can flag leads and contradictions; neither can turn a missing sportsbook quote into an executable selection.
