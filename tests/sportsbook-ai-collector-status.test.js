import test from 'node:test';
import assert from 'node:assert/strict';
import {collectorAuditReport,collectorAiScoutStatus,
 collectorAiScoutSummary,collectorAuditPath,readCollectorAudits}
 from '../lib/pregame-collector-shards.js';

const now=Date.parse('2026-10-11T02:00:00Z'),gameId='401872981';
const risks=['Small','Medium','Nuke'],books=['DraftKings','FanDuel'];
function report(){
 return{gameId,status:'updated',modelTiers:risks,
  sportsbookAiGuard:{
   league:'nfl',gameId,status:'ADVISORY_READY',
   sourceCheckedAt:new Date(now-10*1000).toISOString(),
   flags:[{code:'BOOK_LEGS_NOT_ALL_MATCHED',detail:'Specific player market not found'}],
   items:risks.flatMap(risk=>books.map(book=>({
    risk,book,exactLegs:book==='DraftKings'?4:3,
    requiredLegs:4,marketStatus:book==='DraftKings'?
     'ALL_INDIVIDUAL_LINES_MATCHED_COMBINED_UNQUOTED':'INCOMPLETE_OR_UNAVAILABLE',
    proposedOfferChecks:book==='FanDuel'?[{player:'WR',bookOffers:['65+']}]:[]
   })))
  }
 };
}
test('all-game collector persists six per-book/per-tier Scout diagnostics with NO quote or provider charge',()=>{
 const raw=collectorAuditReport('nfl',0,[report()],{now,due:1});
 const guard=raw.results[0].aiSportsbookScout;
 assert.equal(guard.status,'CURRENT_SOURCE_REVIEW');
 assert.equal(guard.gameId,gameId);
 assert.equal(guard.bookTierChecks.length,6);
 assert.equal(guard.flags[0].code,'BOOK_LEGS_NOT_ALL_MATCHED');
 assert.equal(guard.sourceCheckedAt,new Date(now-10*1000).toISOString());
 assert.equal(guard.combinedOddsVerified,false);
 assert.equal(guard.aiProviderCalled,false);
 assert.equal(guard.additionalSportsbookRequests,0);
 const counts=collectorAiScoutSummary([{status:'COMPLETE',results:raw.results}]);
 assert.equal(counts.currentGameReviews,1);
 assert.equal(counts.bookTierChecks,6);
 assert.equal(counts.missingSelectionChecks,3);
 assert.equal(counts.combinedOddsVerified,0);
});
test('bookScout freshness revalidated on READ even when collector report itself is CURRENT',async()=>{
 const first=collectorAuditReport('nfl',0,[report()],{now,due:1});
 const empty=collectorAuditReport('nfl',1,[],{now,due:0});
 const read=async time=>readCollectorAudits('nfl',{
  now:time,
  listBlobs:async({prefix})=>({blobs:[{pathname:prefix,url:prefix}]}),
  fetchBlob:async url=>({ok:true,json:async()=>
   url===collectorAuditPath('nfl',0)?first:empty})
 });
 const current=await read(now+10*60000);
 assert.equal(current.shards[0].status,'COMPLETE');
 assert.equal(current.shards[0].results[0].aiSportsbookScout.status,'CURRENT_SOURCE_REVIEW');
 assert.equal(current.summary.aiSportsbookScout.currentGameReviews,1);
 assert.equal(current.summary.aiSportsbookScout.bookTierChecks,6);
 const expired=await read(now+17*60000);
 assert.equal(expired.shards[0].status,'COMPLETE');
 assert.equal(expired.shards[0].results[0].aiSportsbookScout.status,'STALE_OR_MISSING');
 assert.equal(expired.shards[0].results[0].aiSportsbookScout.bookTierChecks.length,0);
 assert.equal(expired.summary.aiSportsbookScout.currentGameReviews,0);
 assert.equal(expired.summary.aiSportsbookScout.staleOrMissing,1);
 const old=await read(now+31*60000);
 assert.equal(old.shards[0].status,'STALE');
 assert.equal(old.shards[0].results[0].aiSportsbookScout.status,'STALE_COLLECTOR');
});
test('NBA data without a sportsbook market feed stays BOOK_MARKETS_PENDING, no unearned book matches',()=>{
 const x=report();x.gameId='401917234';x.sportsbookAiGuard={
  gameId:x.gameId,league:'nba',sourceCheckedAt:new Date(now).toISOString(),
  status:'INSUFFICIENT_EVIDENCE',items:[],
  flags:[{code:'SPORTSBOOK_MARKETS_NOT_VERIFIED'}]
 };
 const row=collectorAiScoutStatus(x,{now});
 assert.equal(row.status,'BOOK_MARKETS_PENDING');
 assert.equal(row.bookTierChecks.length,0);
 const saved=collectorAuditReport('nba',1,[x],{now,due:1});
 assert.equal(saved.results[0].aiSportsbookScout.status,'BOOK_MARKETS_PENDING');
 assert.equal(collectorAiScoutSummary([{status:'COMPLETE',results:saved.results}]).bookMarketsPending,1);
 const mismatch={...report(),sportsbookAiGuard:{...report().sportsbookAiGuard,
  gameId:'401100000'}};
 assert.equal(collectorAiScoutStatus(mismatch,{now}).status,'STALE_OR_MISSING');
});
