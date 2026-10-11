import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sgpAiRecheckPlan} from '../lib/sgp-ai-recheck-plan.js';
import {pregameEvidenceAudit,pregameBookMarketFingerprint}
 from '../lib/pregame-revalidation.js';
const now=Date.parse('2026-10-11T09:00:00Z'),gameId='401872981';
const riskList=['Small','Medium','Nuke'];
const cards=riskList.map((risk,i)=>{
 const n=i===0?4:i===1?5:6;
 const legs=Array.from({length:n},(_,j)=>({
  name:'Athlete '+(j+11),playerID:String(j+11),eventID:gameId,team:'JAX',cat:'rushing',
  analyticsThreshold:50+5*j
 }));
 return{risk,requiredLegs:n,legs,tierAssessment:{compositionOk:true},
  bookMarketAudits:{
   DraftKings:{book:'DraftKings',gameId,requestedTier:risk,
    totalLegs:n,matchedLegs:n,allLegsMatched:true,missingLegs:[]},
   FanDuel:{book:'FanDuel',gameId,requestedTier:risk,totalLegs:n,
    matchedLegs:n-1,allLegsMatched:false,
    missingLegs:[{name:'Athlete 11',category:'rushing',requested:50,
     listedOffers:[{display:'55+',minimumToWin:55}]}]}
  }};
});
// A fresh, complete audit must attest EACH exact player/team/event/market
// identity, not just the total matched counter.
for(const card of cards){
 for(const book of ['DraftKings','FanDuel']){
  const audit=card.bookMarketAudits[book];
  audit.legs=card.legs.map((x,i)=>({
   playerID:x.playerID,name:x.name,team:x.team,eventID:x.eventID,
   category:x.cat,requested:x.analyticsThreshold,
   matched:book==='DraftKings'||i!==0,
   listedOffers:book==='FanDuel'&&i===0?
    [{display:'55+',minimumToWin:55}]:[]
  }));
  audit.missingLegs=audit.legs.filter(x=>!x.matched);
 }
}
const verification={league:'nfl',gameId,tiers:riskList.map((risk,i)=>({
 risk,modelStatus:'MODEL_CANDIDATE',books:{
  DraftKings:{status:'EXACT_LEGS_LISTED_COMBINED_ODDS_UNVERIFIED',
   matchedLegs:cards[i].legs.length,requiredLegs:cards[i].legs.length,
   combinedOddsVerified:false,tierVerified:false,missingLegs:[]},
  FanDuel:{status:'BOOK_LEG_MISMATCH',
   matchedLegs:cards[i].legs.length-1,requiredLegs:cards[i].legs.length,
   combinedOddsVerified:false,tierVerified:false,missingLegs:
    cards[i].bookMarketAudits.FanDuel.missingLegs}
 }
}))};
function data(){return{league:'nfl',gameId,sgps:{Analytics:cards},
 sgpVerification:verification,sourceAvailable:true,
 sourceCheckedAt:new Date(now-30000).toISOString(),
 changedFields:['SPORTSBOOK_MARKETS','INJURIES'],now};}
test('each NFL tier and sportsbook receives a next step without altering money, picks, or existing wagers',()=>{
 const p=sgpAiRecheckPlan(data());
 assert.equal(p.status,'SOURCE_SCOPED_RECHECK_PLAN');
 assert.equal(p.tiers.length,3);
 assert.equal(p.tiers.flatMap(t=>t.bookActions).length,6);
 assert.equal(p.needsCombinedQuotes,3);
 assert.equal(p.needsMarketRecheck,3);
 assert.equal(p.observedQuoteTiers,0);
 assert.equal(p.canModifyPicks,false);
 assert.equal(p.canSetOdds,false);
 assert.equal(p.canPlaceWagers,false);
 const medium=p.tiers.find(t=>t.risk==='Medium');
 const dk=medium.bookActions.find(a=>a.book==='DraftKings');
 const fd=medium.bookActions.find(a=>a.book==='FanDuel');
 assert.equal(dk.action,'REQUEST_CORRELATED_BOOK_QUOTE');
 assert.equal(dk.bookableWagerConfirmed,false);
 assert.equal(fd.action,'REVALIDATE_MISSING_LEGS');
 assert.equal(fd.suggestedLineRechecks[0].observedOffers[0].display,'55+');
 assert.equal(fd.suggestedLineRechecks[0].applied,false);
 assert.equal(fd.suggestedLineRechecks[0].requiresUpdatedProjection,true);
 assert.deepEqual([...fd.changedEvidence].sort(),['INJURIES','SPORTSBOOK_MARKETS']);
});
test('a stale, unavailable, wrong-event or wrong-tier book feed NEVER authorizes an SGP quote request',()=>{
 for(const input of [
  {...data(),sourceCheckedAt:new Date(now-16*60000).toISOString()},
  {...data(),sourceAvailable:false},
  {...data(),sgpVerification:{...verification,gameId:'401872982'}},
  {...data(),sgps:{Analytics:cards.map(c=>c.risk==='Medium'?
   {...c,legs:c.legs.slice(0,3)}:c)}}
 ]){
  const p=sgpAiRecheckPlan(input);
  assert.equal(p.observedQuoteTiers,0);
  const all=p.tiers.flatMap(t=>t.bookActions);
  if(input.sourceAvailable===false||new Date(input.sourceCheckedAt).getTime()<now-15*60000)
   assert.ok(all.every(x=>x.action!=='REQUEST_CORRELATED_BOOK_QUOTE'));
  if(input.sgpVerification.gameId!==gameId)
   assert.ok(all.every(x=>x.action!=='REQUEST_CORRELATED_BOOK_QUOTE'));
  assert.ok(all.every(x=>x.bookableWagerConfirmed===false));
 }
 const empty=sgpAiRecheckPlan({league:'soccer',gameId});
 assert.equal(empty.status,'INVALID_EVENT');
});
test('NBA model candidates with no sportsbook feed cannot fabricate player props or quoteable combos',()=>{
 const sgps=[{risk:'Small',status:'MODEL_CANDIDATE',legs:[{},{}]},
  {risk:'Medium',status:'MODEL_CANDIDATE',legs:[{},{},{}]},
  {risk:'Nuke',status:'MODEL_CANDIDATE',legs:[{},{},{},{},{}]}];
 const nba=sgpAiRecheckPlan({league:'nba',gameId:'401917234',sgps,
  sgpVerification:{league:'nba',gameId:'401917234',tiers:sgps.map(s=>({
   risk:s.risk,modelStatus:'MODEL_CANDIDATE',books:{}}))},
  sourceAvailable:false,sourceCheckedAt:new Date(now).toISOString(),now});
 assert.equal(nba.status,'MARKET_SOURCE_PENDING');
 assert.equal(nba.tiers.length,3);
 assert.ok(nba.tiers.flatMap(t=>t.bookActions).every(x=>
  x.action==='REFRESH_AUTHORIZED_MARKETS'&&x.individuallyMatched===null));
});
test('sportsbook line revisions trigger pregame revalidation but timestamp-only refresh does not',()=>{
 const old={gameId,sgpVerification:verification,sgps:[],
  picks:[],injuryEvidence:[],game:{home:{abbr:'JAX'},away:{abbr:'PHI'}}};
 const baseline=pregameEvidenceAudit(null,old,{league:'nfl'});
 const refreshed={...old,evidenceDigests:baseline.evidenceDigests};
 const same={...verification,tiers:verification.tiers.map(t=>({
  ...t,books:{...t.books,DraftKings:{...t.books.DraftKings,
   quoteCheckedAt:new Date(now).toISOString(),reason:'new clock only'}}
 }))};
 const unchanged=pregameEvidenceAudit(refreshed,{...old,sgpVerification:same},{league:'nfl'});
 assert.deepEqual(unchanged.changedFields,[]);
 const changed={...verification,tiers:verification.tiers.map((t,i)=>i!==1?t:{
  ...t,books:{...t.books,FanDuel:{...t.books.FanDuel,
   matchedLegs:t.books.FanDuel.matchedLegs-1,
   missingLegs:[...t.books.FanDuel.missingLegs,{name:'Athlete B',
    category:'receiving',requested:65,listedOffers:[{display:'70+',minimumToWin:70}]}]}}})};
 const out=pregameEvidenceAudit(refreshed,{...old,sgpVerification:changed},{league:'nfl'});
 assert.deepEqual(out.changedFields,['SPORTSBOOK_MARKETS']);
 assert.equal(out.sourceAdjusted,true);
 assert.notDeepEqual(pregameBookMarketFingerprint(verification),pregameBookMarketFingerprint(changed));
});
test('NFL/NBA routes and both user interfaces expose actionable plans with no bookmaker credentials',()=>{
 for(const [path,match] of [
  ['api/nfl-markets.js','const sgpAiPlan=gameId?sgpAiRecheckPlan('],
  ['api/nfl-health.js','snap.sgpAiPlan=sgpAiRecheckPlan('],
  ['api/nba-health.js','result.sgpAiPlan=sgpAiRecheckPlan('],
  ['api/nba-game.js','data.sgpAiPlan='],
  ['index.html','nflSgpAiPlanUi(d,id)'],
  ['public-nba.js','sgpAiNextSteps(d)']
 ]){
  const src=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.ok(src.includes(match),path);
 }
});

test('book quote readiness refuses a count-only, swapped-player, wrong-team or mismatched threshold audit',()=>{
 const input=data();
 for(const change of [
  x=>delete x.legs,
  x=>x.legs[0].playerID='another-athlete',
  x=>x.legs[0].team='PHI',
  x=>x.legs[0].requested=65,
  x=>x.legs[0].category='receiving',
  x=>x.matchedLegs=3,
  x=>x.allLegsMatched=false
 ]){
  const clone=structuredClone(input);
  const a=clone.sgps.Analytics[0].bookMarketAudits.DraftKings;
  change(a);
  const result=sgpAiRecheckPlan(clone).tiers[0].bookActions.find(x=>x.book==='DraftKings');
  assert.equal(result.action,'MATCH_BOOK_PLAYER_PROPS');
  assert.equal(result.individuallyMatched,null);
  assert.equal(result.observedQuoteVerified,false);
  assert.equal(result.bookableWagerConfirmed,false);
 }
});
test('falsely stamped verification status never bypasses missing or inconsistent player market audit',()=>{
 const input=structuredClone(data());
 input.sgpVerification.tiers[0].books.FanDuel={
  status:'TIER_COMBINED_QUOTE_VERIFIED',combinedOddsVerified:true,tierVerified:true,
  matchedLegs:4,requiredLegs:4,
  quoteCheckedAt:new Date(now).toISOString()
 };
 const report=sgpAiRecheckPlan(input),fd=report.tiers[0].bookActions.find(x=>x.book==='FanDuel');
 assert.equal(fd.action,'REVALIDATE_MISSING_LEGS');
 assert.equal(fd.observedQuoteVerified,false);
 assert.equal(report.observedQuoteTiers,0);
});
