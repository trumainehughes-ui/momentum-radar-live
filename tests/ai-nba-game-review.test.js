import test from "node:test";
import assert from "node:assert/strict";
import { reviewNbaGameMarkets } from "../lib/ai-mechanics/nba-game-review.js";

const now=10000000;
const player={playerId:"espn-1",team:"DEN",position:"C",availability:"ACTIVE_ROTATION",
  starterStatus:"CONFIRMED_STARTER",verification:{role:{verified:true}}};
const game={gameId:"espn-game-1",teams:[{abbr:"DEN"},{abbr:"MIN"}],
  playerProjections:[player]};
const pick={gameId:"espn-game-1",playerId:"espn-1",team:"DEN",
  market:"points",line:24.5,sportsbook:"DraftKings"};
const offer={book:"DraftKings",line:24.5,odds:-115,available:true,
  lastUpdatedAt:new Date(now-60000).toISOString()};
const market={gameId:"espn-game-1",providerEventId:"sgo-event-1",
  provenance:"verified_server_crosswalk",source:"SportsGameOdds",
  playerId:"espn-1",team:"DEN",market:"points",books:[offer]};
const input={game,picks:[pick],markets:[market],now};

test("NBA half-point game-specific DraftKings prop is reviewable without NFL yardage rounding",()=>{
 const result=reviewNbaGameMarkets(input);
 assert.equal(result.ready,true,JSON.stringify(result));
 assert.equal(result.marketEvidence.observedBookLines,1);
 assert.equal(result.marketEvidence.combinedSgpQuoteVerified,false);
 assert.equal(result.publishingDisabled,true);
 assert.equal(result.league,"NBA");
});
test("NBA same-game review rejects wrong team or game",()=>{
 assert.equal(reviewNbaGameMarkets({...input,picks:[{...pick,gameId:"another"}]}).ready,false);
 assert.equal(reviewNbaGameMarkets({...input,picks:[{...pick,team:"LAL"}]}).ready,false);
});
test("NBA must verify exact sportsbook and exact half-point line",()=>{
 assert.equal(reviewNbaGameMarkets({...input,picks:[{...pick,line:25.5}]}).ready,false);
 assert.equal(reviewNbaGameMarkets({...input,picks:[{...pick,sportsbook:"FanDuel"}]}).ready,false);
});
test("NBA starter and active status rules match NFL fail-closed behavior",()=>{
 const changed={...game,playerProjections:[{...player,starterStatus:"EXPECTED_STARTER"}]};
 const output=reviewNbaGameMarkets({...input,game:changed});
 assert.equal(output.ready,false);
 assert.ok(output.reviewed[0].reasons.includes("starter_or_active_status_unconfirmed"));
});
test("NBA quotes expire on original provider timestamp",()=>{
 const result=reviewNbaGameMarkets({...input,now:now+17*60*1000});
 assert.equal(result.ready,false);
 assert.equal(result.marketEvidence.observedBookLines,0);
});
test("NBA book lines must originate from a server-controlled identity crosswalk",()=>{
 const result=reviewNbaGameMarkets({...input,markets:[{...market,provenance:"client_body"}]});
 assert.equal(result.ready,false);
 assert.ok(result.reviewed[0].reasons.includes("missing_server_verified_market_identity"));
});
test("NBA injuries or missing player records block advice",()=>{
 const changed={...game,playerProjections:[{...player,availability:"OUT"}]};
 assert.equal(reviewNbaGameMarkets({...input,game:changed}).ready,false);
 assert.equal(reviewNbaGameMarkets({...input,game:{...game,playerProjections:[]}}).ready,false);
});
test("unsupported sport props are excluded from NBA",()=>{
 assert.equal(reviewNbaGameMarkets({...input,picks:[{...pick,market:"passing_yards"}]}).ready,false);
});
test("Small Medium Nuke NBA price estimates cannot masquerade as book-quoted SGPs",()=>{
 const modelSgps=["Small","Medium","Nuke"].map(risk=>({risk,book:"DraftKings",
   estimatedOdds:risk==="Nuke"?13000:2500,payoutBandVerified:true}));
 const output=reviewNbaGameMarkets({...input,modelSgps});
 assert.equal(output.sgps.length,3);
 for(const s of output.sgps){
   assert.equal(s.actualSgpOdds,null);
   assert.equal(s.combinedBookQuoteVerified,false);
   assert.equal(s.bookVerificationPending,true);
 }
});
test("NBA no-book model mode remains explicitly unverified",()=>{
 const result=reviewNbaGameMarkets({...input,picks:[],markets:[]});
 assert.equal(result.ready,false);
 assert.equal(result.marketEvidence.state,"ANALYTICS_ONLY");
 assert.equal(result.combinedSgpQuoteVerified,false);
});
