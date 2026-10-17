# BetBot-inspired browser companion for Momentum Radar

This independently written, read-only companion follows the **local Chrome connection architecture** of [eric-barch/betbot](https://github.com/eric-barch/betbot). No BetBot source code is copied. It is an **optional desktop companion**, not a cloud odds API or an unattended Vercel scraper.

## What it can and cannot do

- With the owner's permission, read **only the text already visibly rendered** in manually opened FanDuel or DraftKings Chrome tabs.
- Identify exact NFL passing/rushing/receiving/reception/anytime-TD props for a game-scoped Momentum Radar roster. The tested FanDuel player-detail alternate-rushing-yards layout is supported; complete coverage of other layouts is not established.
- Preserve each first-party sportsbook, offered line, American price, game and timestamp. The existing AI selector can compare **real 125+ and 150+** options without inventing 135+.
- Does **not** log in, bypass CAPTCHA or human verification, place bets, read cookies, drive navigation, call third-party odds APIs, or create a sportsbook-accepted combined SGP price.
- A challenged or unsupported page produces zero offers. Browser capture is not equivalent to independent server verification.

## 1. Install (desktop)

Requires **Node.js 24**, Chrome and an owner-controlled computer. In your local Momentum Radar checkout:

    npm --prefix tools/browser-companion install

Launch **a separate Chrome profile** with Chrome debugging bound to loopback. Never expose port 9222 to the network. Use a Chrome profile with no sensitive logged-in accounts.

Windows PowerShell:

    & "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --user-data-dir="$env:LOCALAPPDATA\MomentumRadarObserverChrome"

macOS:

    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --user-data-dir="$HOME/.momentum-radar-observer-chrome"

Linux:

    google-chrome --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --user-data-dir="$HOME/.momentum-radar-observer-chrome"

Manually open the official sportsbook's relevant NFL matchup and player props in that Chrome instance. Do not attempt to bypass access controls or a human verification challenge.

## 2. Observe exact first-party offers (dry-run by default)

    node tools/browser-companion/companion.mjs --date=2026-10-18 --game=401872999

Substitute the actual upcoming date and game ID shown by Momentum Radar. Add `--book=FanDuel` to restrict the book. Optional `--poll-seconds=300` repeats while the local process is running, with a minimum 60-second interval. Ctrl+C stops it.

By default, only checked market rows and collection status are printed on the local computer. Nothing is published and no raw site text or cookies are uploaded.

## 3. Authorized global publication

The existing API requires a separate `MOMENTUM_BOOK_PUBLISH_KEY` configured privately in Vercel. To use `--publish`, the operator must provision that SAME dedicated key as an environment variable on the local machine, or rotate the Vercel key to one they control. **Never share the key, paste it into chat, commit it, use a sportsbook password, or reuse CRON_SECRET.**

    node tools/browser-companion/companion.mjs --date=2026-10-18 --game=401872999 --publish

Admin POST validates the exact scheduled game, current roster, sportsbook domain, line, American odds and observation timestamp. The public GET feed makes accepted observations visible to both production and `/picks`. All observations expire after 20 minutes. Publishing may fail when the game roster cannot be verified.

## Readiness checklist

- A real current first-party sportsbook page must display the exact markets without an access challenge.
- The local browser companion must capture a fresh line with player/game/source/price.
- Authorized publication must succeed, and production and public pages must show matching rows before expiration.
- The model must only choose options actually published by that sportsbook (e.g. 125+ or 150+, never invented 135+).
- Game-day roster and injury eligibility must pass.
- **Combined SGP odds cannot be called confirmed** until the sportsbook accepts the actual multi-leg slip and quotes it.

Tests and successful Vercel deployments alone do **not** establish a working unattended sportsbook collector. The browser companion is a separate owner-run desktop process.
