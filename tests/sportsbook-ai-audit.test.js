import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sportsbookAiEvidenceFromSnapshot,sportsbookAiAuditFromSnapshot}
 from '../lib/sportsbook-ai-audit.js';

const now=Date.parse('2026-10-11T00:00:00Z'),gameId='401872981';
const cards=['Small','Medium','Nuke'].map((risk,i)=>{
 const n=i===0?4:i===1?5:6;
 const riskRow={risk,legs:Array.from({length:n},(_,j)=>({
  playerID:String(j+1),team:'JAX',eventID:gameId,cat:'receiving',analyticsThreshold:50+5*j
 }))};
 riskRow.bookMarketAudits=Object.fromEntries(['FanDuel','DraftKings'].map(book=>[book,{
  book,gameId,requestedTier:risk,totalLegs:n,matchedLegs:book==='FanDuel'?n-1:n,
  status:book==='FanDuel'?'MODEL_LINES_NOT_FULLY_LISTED':
   'ALL_LEGS_LISTED_COMBINED_ODDS_UNVERIFIED',
  missingLegs:book==='FanDuel'?[{name:'Player 1',category:'receiving',requested:50,
   listedOffers:[{display:'55+',minimumToWin:55}]}]:[]
 }]));
 return riskRow;
});
function nfl(){return{league:'nfl',gameId,sgps:{Analytics:cards},
 sgpVerification:{league:'nfl',gameId,
  tiers:cards.map(x=>({risk:x.risk,modelStatus:'MODEL_CANDIDATE'}))},
 sourceCheckedAt:new Date(now-20000).toISOString(),marketFeedAvailable:true};}
test('every NFL SGP tier receives auto review of both books, with no LLM or sportsbook request',()=>{
 const result=sportsbookAiAuditFromSnapshot(nfl(),{now});
 assert.equal(result.status,'ADVISORY_READY');
 assert.equal(result.reviewedTiers.length,3);
 assert.equal(result.books.length,2);
 assert.equal(result.items.length,6);
 assert.equal(result.aiProviderCalled,false);
 assert.equal(result.additionalSportsbookRequests,0);
 assert.equal(result.canSetOdds,false);
 assert.equal(result.canChangePicks,false);
 assert.equal(result.bookmakerCombinedOddsVerified,false);
 const fd=result.items.find(x=>x.risk==='Small'&&x.book==='FanDuel');
 const dk=result.items.find(x=>x.risk==='Small'&&x.book==='DraftKings');
 assert.equal(fd.exactLegs,3);
 assert.equal(fd.proposedOfferChecks[0].bookOffers[0],'55+');
 assert.equal(dk.exactLegs,4);
 assert.equal(dk.marketStatus,'ALL_INDIVIDUAL_LINES_MATCHED_COMBINED_UNQUOTED');
 assert.ok(!JSON.stringify(result).includes('americanOdds'));
});
test('legacy mismatched-event sportsbook rows cannot be labeled as listed',()=>{
 const d=nfl();
 d.sgps.Analytics[0].bookMarketAudits.FanDuel={
  ...d.sgps.Analytics[0].bookMarketAudits.FanDuel,gameId:'401872982'
 };
 const evidence=sportsbookAiEvidenceFromSnapshot(d);
 assert.equal(evidence.sportsbooks.tiers[0].books.FanDuel.status,'UNVERIFIED');
 assert.equal(evidence.sportsbooks.tiers[0].books.FanDuel.matchedLegs,null);
 const result=sportsbookAiAuditFromSnapshot(d,{now});
 assert.ok(result.flags.some(x=>x.code==='SPORTSBOOK_AUDIT_INCOMPLETE'));
});
test('no NFL live source, expired source, invalid ESPN identity, and NBA model-only fail closed',()=>{
 const expired=nfl();
 expired.sourceCheckedAt=new Date(now-16*60000).toISOString();
 const stale=sportsbookAiAuditFromSnapshot(expired,{now});
 assert.equal(stale.items.length,0);
 assert.ok(stale.flags.some(x=>x.code==='SPORTSBOOK_MARKETS_STALE'));
 const noMarkets=nfl();noMarkets.marketFeedAvailable=false;
 assert.equal(sportsbookAiAuditFromSnapshot(noMarkets,{now}).items.length,0);
 const nba={league:'nba',gameId:'401917234',
  sgps:[{risk:'Small',status:'MODEL_CANDIDATE',legs:[{},{}]}],
  sgpVerification:{league:'nba',gameId:'401917234',
   tiers:[{risk:'Small',modelStatus:'MODEL_CANDIDATE'}]},
  sourceCheckedAt:new Date(now).toISOString(),marketFeedAvailable:false};
 const pending=sportsbookAiAuditFromSnapshot(nba,{now});
 assert.equal(pending.status,'INSUFFICIENT_EVIDENCE');
 assert.equal(pending.items.length,0);
 assert.equal(pending.bookmakerCombinedOddsVerified,false);
 assert.equal(sportsbookAiAuditFromSnapshot({...nfl(),gameId:'../id'}).status,'UNSUPPORTED_GAME');
});
test('both NFL and NBA persist always-on source-scoped scout, while Groq remains on-demand',()=>{
 const nflRoute=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const nbaCollector=readFileSync(new URL('../api/nba-health.js',import.meta.url),'utf8');
 const client=readFileSync(new URL('../public-ai.js',import.meta.url),'utf8');
 assert.match(nflRoute,/sportsbookAiGuard=gameId\?sportsbookAiAuditFromSnapshot/);
 assert.match(nflRoute,/sgpVerification:verifiedSgp/);
 assert.match(nbaCollector,/result\.sportsbookAiGuard=sportsbookAiAuditFromSnapshot/);
 assert.match(nbaCollector,/marketFeedAvailable:false/);
 assert.ok(client.includes('<option value="sportsbook">'));
 assert.ok(client.includes("mode==='sportsbook'?sportsbookEvidence(m,gameId):null"));
 assert.ok(!nflRoute.includes('OPTICODDS_DISCOVERY_ENABLED='));
});
