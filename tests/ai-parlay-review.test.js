import test from "node:test";
import assert from "node:assert/strict";
import { reviewParlay } from "../lib/ai-mechanics/parlay-review.js";

const player = { id: "p1", team: "A", status: "active", starterConfirmed: true };
const market = { playerId: "p1", team: "A", market: "rushing_yards", line: 85, sportsbook: "FanDuel", available: true, source: "SportsGameOdds:FanDuel", timestamp: 1000 };
const leg = { gameId: "g1", playerId: "p1", team: "A", market: "rushing_yards", line: 85, sportsbook: "FanDuel" };
const quote = { sportsbook: "FanDuel", source: "verified_book_quote", americanOdds: 10000, timestamp: 1000, legs: [leg] };
const input = { legs: [leg], tier: "nuke", combinedAmericanOdds: 10000, sportsbook: "FanDuel", priceSource: "verified_book_quote", quote, now: 1100, context: { gameId: "g1", activePlayers: [player], markets: [market] } };

test("current same-book SGP quote and confirmed starter pass advisory review", () => {
  const r = reviewParlay(input);
  assert.equal(r.valid, true, r.reasons.join(", "));
  assert.equal(r.advisoryOnly, true);
});
test("missing combined quote fails closed", () =>
  assert.ok(reviewParlay({ ...input, quote: undefined }).reasons.some(x => x.startsWith("combined_quote:"))));
test("stale combined quote fails closed", () =>
  assert.ok(reviewParlay({ ...input, now: 350000 }).reasons.includes("combined_quote:stale_combined_price")));
test("future-dated combined quote fails closed", () =>
  assert.ok(reviewParlay({ ...input, quote: { ...quote, timestamp: 1300 } }).reasons.includes("combined_quote:stale_combined_price")));
test("book quote must equal displayed payout", () =>
  assert.ok(reviewParlay({ ...input, combinedAmericanOdds: 11000 }).reasons.includes("combined_price_mismatch")));
test("unattributed quote is rejected", () =>
  assert.ok(reviewParlay({ ...input, quote: { ...quote, source: "model_estimate" } }).reasons.includes("combined_quote:quote_provenance_missing")));
test("model-derived price source cannot impersonate book price", () =>
  assert.ok(reviewParlay({ ...input, priceSource: "model_estimate" }).reasons.includes("verified_combined_price_required")));
test("quote from a different sportsbook fails", () =>
  assert.ok(reviewParlay({ ...input, quote: { ...quote, sportsbook: "DraftKings" } }).reasons.includes("combined_quote:quote_provenance_missing")));
test("leg with sportsbook different from SGP is blocked", () =>
  assert.ok(reviewParlay({ ...input, legs: [{ ...leg, sportsbook: "DraftKings" }] }).reasons.includes("leg_1:sportsbook_mismatch")));
test("other book's market cannot verify a FanDuel leg", () =>
  assert.ok(reviewParlay({ ...input, context: { ...input.context, markets: [{ ...market, sportsbook: "DraftKings" }] } }).reasons.includes("leg_1:market_not_available_at_supported_book")));
test("inactive player fails active check", () =>
  assert.ok(reviewParlay({ ...input, context: { ...input.context, activePlayers: [{ ...player, status: "out" }] } }).reasons.includes("leg_1:starter_or_active_status_unconfirmed")));
test("unconfirmed starter cannot appear as verified SGP leg", () =>
  assert.ok(reviewParlay({ ...input, context: { ...input.context, activePlayers: [{ ...player, starterConfirmed: false }] } }).reasons.includes("leg_1:starter_or_active_status_unconfirmed")));
test("stale leg market fails even if combined quote is fresh", () =>
  assert.ok(reviewParlay({ ...input, context: { ...input.context, markets: [{ ...market, timestamp: -1000000 }] } }).reasons.includes("leg_1:stale_or_unattributed_market")));
test("different games cannot mix in a same-game parlay", () =>
  assert.ok(reviewParlay({ ...input, legs: [leg, { ...leg, gameId: "g2" }] }).reasons.includes("different_games_in_sgp")));
test("missing game scope fails closed", () =>
  assert.ok(reviewParlay({ ...input, legs: [{ ...leg, gameId: undefined }] }).reasons.includes("missing_leg_game_identity")));
test("game scope must match selected game", () =>
  assert.ok(reviewParlay({ ...input, context: { ...input.context, gameId: "g2" } }).reasons.includes("leg_game_context_mismatch")));
test("nuke requires at least +10000 verified price", () =>
  assert.ok(reviewParlay({ ...input, quote: { ...quote, americanOdds: 9999 }, combinedAmericanOdds: 9999 }).reasons.includes("tier_payout_below_target")));
test("unsupported sportsbook fails closed", () =>
  assert.ok(reviewParlay({ ...input, sportsbook: "Other" }).reasons.includes("verified_combined_price_required")));


test("combined quote for a different player is rejected", () =>
  assert.ok(reviewParlay({ ...input, quote: { ...quote, legs: [{ ...leg, playerId: "someone-else" }] } }).reasons.includes("combined_quote_legs_mismatch")));
test("combined quote for a different line is rejected", () =>
  assert.ok(reviewParlay({ ...input, quote: { ...quote, legs: [{ ...leg, line: 90 }] } }).reasons.includes("combined_quote_legs_mismatch")));
test("combined quote without leg identities is rejected", () =>
  assert.ok(reviewParlay({ ...input, quote: { ...quote, legs: undefined } }).reasons.includes("combined_quote_legs_mismatch")));
test("combined quote for a different game is rejected", () =>
  assert.ok(reviewParlay({ ...input, quote: { ...quote, legs: [{ ...leg, gameId: "g2" }] } }).reasons.includes("combined_quote_legs_mismatch")));
test("duplicate legs are rejected even with a matching combined quote", () =>
  assert.ok(reviewParlay({ ...input, legs: [leg, leg], quote: { ...quote, legs: [leg, leg] } }).reasons.includes("duplicate_legs")));
