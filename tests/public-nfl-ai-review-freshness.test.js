import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflReviewedModelDigest,nflReviewedInjuryDigest,
 nflAiReviewMarketAgreement} from '../lib/nfl-ai-review-integrity.js';
import {publicAiSummary} from '../api/public-nfl-ai.js';

const gameId='401872994',date='2026-10-12',
 kickoff='2026-10-13T00:15:00Z',
 now=Date.parse('2026-10-12T23:58:00Z');
const player=(id,name,cat,threshold,team='LAR')=>({
 playerID:id,name,team,cat,eventID:gameId,analyticsThreshold:threshold
});
const oldLegs=[
 player('4570037','Terrance Ferguson','receptions',4),
 player('1111111','Example QB','passing',265,'BUF'),
 player('2222222','Example RB','rushing',55,'BUF'),
 player('3333333','Example WR','receiving',60)
];
const newLegs=[
 player('4444444','Replacement TE','receptions',4),
 ...oldLegs.slice(1)
];
const marketOf=(legs,injuries=[],at=now-60_000)=>({
 at,body:{ok:true,date,gameId,
  sgps:{Analytics:[{risk:'Small',legs}]},
  validation:{injuryEvidence:injuries}}});
function snap(legs,injuries=[]){
 const snapshot={league:'nfl',gameId,game:{gameId,kickoff},
  injuryChecks:{rosterAndInjuryEligibilityChecked:true},
  sgps:[{risk:'Small',source:'DATA_MODEL',legs:legs.map(x=>({
   ...x,category:x.cat,threshold:x.analyticsThreshold}))}],
  injuryEvidence:injuries,
  aiReview:{status:'REVIEWED',summary:'Verified model selection review.',
   advisoryOnly:true,canAlterPicks:false,
   checkedAt:new Date(now-3*60_000).toISOString()}};
 snapshot.aiReview.modelSelectionDigest=nflReviewedModelDigest(snapshot);
 snapshot.aiReview.injurySelectionDigest=nflReviewedInjuryDigest(injuries);
 return snapshot;
}
test('corrected SGP rejects the old AI narrative mentioning IR player',()=>{
 const historical=snap(oldLegs),current=marketOf(newLegs,[{
  playerId:'4570037',name:'Terrance Ferguson',team:'LAR',status:'IR'
 }]);
 const integrity=nflAiReviewMarketAgreement(historical,current,{date,gameId,now});
 assert.deepEqual(integrity,{ok:false,status:'AI_REVIEW_NEEDS_REVALIDATION'});
 const visible=publicAiSummary(historical,{date,gameId,now,
  currentMarket:current,requireMarketAgreement:true});
 assert.equal(visible.status,'REVIEW_PENDING');
 assert.equal(visible.reason,'AI_REVIEW_NEEDS_REVALIDATION');
 assert.ok(!JSON.stringify(visible).includes('Terrance Ferguson'));
 assert.ok(!JSON.stringify(visible).includes('Verified model selection review'));
});
test('current AI narrative passes only with exact matching reviewed legs and injury statuses',()=>{
 const injury=[{playerId:'4570037',team:'LAR',name:'Terrance Ferguson',status:'IR'}];
 const history=snap(newLegs,injury),market=marketOf(newLegs,injury);
 const good=nflAiReviewMarketAgreement(history,market,{date,gameId,now});
 assert.equal(good.ok,true);
 const presented=publicAiSummary(history,{date,gameId,now,
  currentMarket:market,requireMarketAgreement:true});
 assert.equal(presented.status,'SAVED_AI_REVIEW');
 assert.match(presented.analysis,/Verified model selection review/);
 const changed=marketOf(newLegs,[{...injury[0],status:'ACTIVE'}]);
 assert.equal(nflAiReviewMarketAgreement(history,changed,{date,gameId,now}).ok,false);
});
test('legacy AI narrative lacking review fingerprints does not become current automatically',()=>{
 const history=snap(newLegs),market=marketOf(newLegs);
 delete history.aiReview.modelSelectionDigest;
 delete history.aiReview.injurySelectionDigest;
 const x=publicAiSummary(history,{date,gameId,now,
  currentMarket:market,requireMarketAgreement:true});
 assert.equal(x.status,'REVIEW_PENDING');
});
test('stale, mismatched and unavailable market snapshots invalidate AI narrative',()=>{
 const history=snap(newLegs);
 for(const market of [
  null,marketOf(newLegs,[],now-16*60_000),
  {...marketOf(newLegs),body:{...marketOf(newLegs).body,gameId:'401999999'}},
  {...marketOf(newLegs),body:{...marketOf(newLegs).body,date:'2026-10-13'}}
 ]){
  assert.equal(nflAiReviewMarketAgreement(history,market,{date,gameId,now}).ok,false);
 }
});
test('public AI API reads only existing saved game and market snapshots, with no paid AI requests',()=>{
 const route=readFileSync(new URL('../api/public-nfl-ai.js',import.meta.url),'utf8');
 const review=readFileSync(new URL('../lib/pregame-ai-review.js',import.meta.url),'utf8');
 const publicHtml=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 assert.match(route,/nflSgpSnapshotPath/);
 assert.match(route,/requireMarketAgreement:true/);
 assert.match(route,/REVIEW_PENDING/);
 assert.ok(!route.includes('/api/ai-analysis'));
 assert.match(review,/modelSelectionDigest:nflReviewedModelDigest\(snapshot\)/);
 assert.match(review,/injurySelectionDigest:nflReviewedInjuryDigest\(snapshot.injuryEvidence\)/);
 assert.ok(publicHtml.includes('AI-Assisted Model Brief'));
 assert.ok(publicHtml.includes('Top Anytime TD opportunities'));
});
