import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const markets = readFileSync(new URL("../api/nfl-markets.js", import.meta.url), "utf8");
const ai = readFileSync(new URL("../api/ai-analysis.js", import.meta.url), "utf8");

test("historic manual sportsbook examples cannot enter active SGP candidates", () => {
  // This regression once leaked hand-entered October 5 ATL/NO prices into
  // subsequent games because the array was unconditionally merged.
  assert.match(markets, /const historicPublicSgpExamples=\[/);
  assert.match(markets, /const mergedMarketRows=\[\.\.\.\(rows\|\|\[\]\)\];/);
  const merged = markets.match(/const mergedMarketRows=([^;]+);/)?.[1] || "";
  assert.ok(merged.length > 0);
  assert.doesNotMatch(merged, /publicRefs|historicPublicSgpExamples|publicBookRows|publicDerivedRows/i);
});
test("dated October 5 snapshot is archived context only, not fresh sportsbook evidence", () => {
  assert.match(markets, /const publicRefs=\[\];/);
  assert.match(markets, /manualMarketContext=/);
  assert.match(markets, /manualAtlNoTonightSgps\(date,home,away\)/);
});
test("Nuke floor consistently requires +10000 or better", () => {
  assert.match(markets, /Nuke:\{min:10000,max:Infinity\}/);
  assert.match(markets, /Nuke minimum of \+10000/);
  assert.doesNotMatch(markets, /\+9900|Nuke:\{min:9900/);
});
test("Nuke +10000 accurately distinguishes net winnings from payout", () => {
  assert.match(markets, /\$1,000 profit, \$1,010 total/);
  assert.match(ai, /Nuke \+10000 or higher/);
  assert.match(ai, /\$1,000 profit and \$1,010 total/);
});
