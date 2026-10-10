import test from "node:test";
import assert from "node:assert/strict";
import { summarizeMarketEvidence } from "../lib/ai-mechanics/market-health.js";

const row={books:[{book:"FanDuel",odds:-110,line:84.5,available:true}]};
test("provider-observed player prop is not a combined SGP quote",()=>{
  const x=summarizeMarketEvidence({rows:[row]});
  assert.equal(x.state,"BOOK_LINES_OBSERVED_UNQUOTED");
  assert.equal(x.observedBookLines,1);
  assert.equal(x.combinedSgpQuoteVerified,false);
});
test("failed and unsupported sportsbook data do not count as evidence",()=>{
  const x=summarizeMarketEvidence({rows:[{books:[
    {...row.books[0],available:false},
    {book:"Other",odds:-110,line:84.5,available:true},
    {book:"DraftKings",odds:null,line:85,available:true}
  ]}]});
  assert.equal(x.state,"ANALYTICS_ONLY");
  assert.equal(x.observedBookLines,0);
});
test("provider credit exhaustion beats generic analytics-only label",()=>{
  const x=summarizeMarketEvidence({rows:[],oddsDebug:{
    sgoError:"sportsbook_rate_limited_no_snapshot",
    error:"odds_api_markets_401|code=OUT_OF_USAGE_CREDITS|remaining=0|used=500"
  }});
  assert.equal(x.state,"PROVIDER_QUOTA_EXHAUSTED");
  assert.equal(x.combinedSgpQuoteVerified,false);
});
test("SGO-only rate limit is identified without fetching anything",()=>{
  const x=summarizeMarketEvidence({rows:[],oddsDebug:{sgoError:"sportsbook_rate_limited_no_snapshot"}});
  assert.equal(x.state,"PROVIDER_RATE_LIMITED");
});
test("stale cached snapshot overrides formerly observed odds",()=>{
  const x=summarizeMarketEvidence({rows:[row],stale:true});
  assert.equal(x.state,"STALE_SNAPSHOT");
  assert.equal(x.combinedSgpQuoteVerified,false);
});
test("empty or corrupt input fails gracefully to model-only",()=>{
  assert.equal(summarizeMarketEvidence({rows:null}).state,"ANALYTICS_ONLY");
  assert.equal(summarizeMarketEvidence().observedBookLines,0);
});
