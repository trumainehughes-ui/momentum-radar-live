import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflSgpSnapshotPath,nflSgpSnapshotReadiness,nflSgpReadinessFromBlob,
 NFL_SGP_SNAPSHOT_SCHEMA} from '../lib/nfl-sgp-snapshot-status.js';
import handler from '../api/nfl-sgp-status.js';
const gameId='401872981',date='2026-10-11',now=Date.parse('2026-10-10T23:50:00Z');
const sample=(at=now-60_000)=>({at,body:{
 ok:true,gameId,date,sgps:{Analytics:[
  {risk:'Small',requiredLegs:4,legs:[],
   reason:'Insufficient verified rushing / receiving yardage legs',
   tierAssessment:{compositionOk:false}},
  {risk:'Medium',requiredLegs:5,legs:[],
   reason:'No 5-leg composition passed injury and role checks',
   tierAssessment:{compositionOk:false}},
  {risk:'Nuke',requiredLegs:5,legs:[],
   reason:'No 5-7 leg supported elevated yardage ceilings',
   tierAssessment:{compositionOk:false}}
 ]},analyticsAvailable:true,categories:{passing:[{name:'QB'}],rushing:[{name:'RB'}],
 receiving:[{name:'WR1'},{name:'WR2'}],td:[{name:'WR1'}]},
 validation:{injuryEligibilityChecked:true,blockedPlayerCount:2,
   dayAheadRoleSource:'ESPN_SAME_SEASON_USAGE_CONDITIONAL',
   dayAheadRoleChecks:{sampled:9,eligibleByExistingRole:1,projectedHighUsageRoles:3,
    missingSeasonUsage:1,missingRosterOrGameIdentity:1,blockedInjuryOrQuestionable:2,
    unconfirmedQuarterback:1,missingCurrentGameRole:0}}
}});
test('snapshot path exactly matches production cache naming without charging any provider',()=>{
 const source=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(source.includes("const CACHE_SCHEMA='v92-strict-nuke-profit-20261011'+'-nuke-roster-adaptive-1-game-identity-2'+'-day-ahead-roles-v5-teamid-depthchart'"));
 assert.equal(NFL_SGP_SNAPSHOT_SCHEMA,'v92-strict-nuke-profit-20261011-nuke-roster-adaptive-1-game-identity-2-day-ahead-roles-v5-teamid-depthchart');
 assert.equal(nflSgpSnapshotPath(date,gameId),
  'momentum-nfl-markets/v2/'+NFL_SGP_SNAPSHOT_SCHEMA+'-2026-10-11-401872981.json');
 for(const [d,id] of [['2026-02-30',gameId],['2026-13-99',gameId],
  ['2026-10-11','fake'],['2026-10-11','../../admins']]){
  assert.equal(nflSgpSnapshotPath(d,id),null);
 }
});
test('no completed Small, Medium, Nuke reports concrete missing-yardage vs identity, not invented lines',()=>{
 const status=nflSgpSnapshotReadiness(sample(),{now,gameId});
 assert.equal(status.status,'NOT_READY');
 assert.deepEqual(status.tiers.map(x=>x.status),['NOT_READY','NOT_READY','NOT_READY']);
 assert.ok(status.tiers[0].reason.includes('rushing / receiving'));
 assert.equal(status.roleSummary.projectedHighUsageRoles,3);
 assert.equal(status.roleSummary.missingRosterOrGameIdentity,1);
 assert.equal(status.roleSummary.blockedInjuryOrQuestionable,2);
 assert.equal(status.sportsbookCombinedOddsVerified,false);
 assert.equal(status.playerModelRows.receiving,2);
 assert.ok(status.tiers.every(x=>x.legCount===0&&!('legs' in x)));
 assert.ok(!JSON.stringify(status).includes('QB'));
});
test('complete composition reports model-only, never verified sportsbook quote',()=>{
 const good=sample();
 const legs=Array.from({length:4},(_,i)=>({playerID:String(1234+i),cat:i===0?'rushing':i===1?'receiving':i===2?'receptions':'passing'}));
 good.body.sgps.Analytics[0]={risk:'Small',requiredLegs:4,
  tierAssessment:{compositionOk:true},legs};
 const status=nflSgpSnapshotReadiness(good,{now,gameId});
 assert.equal(status.status,'MODEL_ONLY');
 assert.equal(status.tiers[0].legCount,4);
 assert.equal(status.tiers[0].status,'MODEL_CANDIDATE');
 assert.equal(status.tiers[1].status,'NOT_READY');
 assert.equal(status.sportsbookCombinedOddsVerified,false);
 assert.ok(!JSON.stringify(status).includes('"playerID"'),
  'health report never exposes actual players or accepts client-side writes');
});
test('only fresh, source-verified exact-tier bookmaker quotes appear in SGP health',()=>{
 const fresh=sample(),book='FanDuel',risk='Nuke';
 const q={book,risk,legs:Array.from({length:5},(_,i)=>({playerID:'private-'+i})),
  requiredLegs:5,actualSgpOdds:10001,combinedBookQuoteVerified:true,
  publishable:true,bookVerificationPending:false,
  quotedAt:new Date(now-90_000).toISOString()};
 fresh.body.sgps.FanDuel=[q];
 const status=nflSgpSnapshotReadiness(fresh,{now,gameId});
 assert.equal(status.status,'BOOK_QUOTED_PARTIAL');
 assert.equal(status.sportsbookCombinedOddsVerified,true);
 assert.equal(status.bookQuotes.length,1);
 assert.equal(status.bookQuotes[0].book,'FanDuel');
 assert.equal(status.bookQuotes[0].risk,'Nuke');
 assert.equal(status.bookQuotes[0].americanOdds,10001);
 assert.equal(status.bookQuotes[0].netProfitOnTen,1000.1);
 assert.equal(status.tiers.find(x=>x.risk==='Nuke').sportsbookCombinedOddsVerified,true);
 assert.ok(!JSON.stringify(status).includes('private-0'));
 assert.ok(!JSON.stringify(status).includes('"legs"'));
});
test('stale, fake-tier, unsigned and mismatched quote metadata never become verified',()=>{
 const base=sample();
 const quote={
  book:'DraftKings',risk:'Small',requiredLegs:4,
  legs:[{playerID:'a'},{playerID:'b'},{playerID:'c'},{playerID:'d'}],
  combinedBookQuoteVerified:true,publishable:true,bookVerificationPending:false,
  actualSgpOdds:2500,quotedAt:new Date(now-90_000).toISOString()
 };
 for(const variant of [
  {...quote,book:'FanDuel'}, {...quote,risk:'Nuke'},
  {...quote,actualSgpOdds:10000}, {...quote,actualSgpOdds:2500.5},
  {...quote,actualSgpOdds:'2500'}, {...quote,publishable:false},
  {...quote,combinedBookQuoteVerified:false},
  {...quote,bookVerificationPending:true},
  {...quote,requiredLegs:3},
  {...quote,quotedAt:new Date(now+1000).toISOString()},
  {...quote,quotedAt:new Date(now-16*60_000).toISOString()},
  {...quote,legs:quote.legs.slice(0,3)}
 ]){
  const bad=structuredClone(base);
  bad.body.sgps.DraftKings=[variant];
  const out=nflSgpSnapshotReadiness(bad,{now,gameId});
  assert.equal(out.sportsbookCombinedOddsVerified,false,JSON.stringify(variant).slice(0,200));
  assert.deepEqual(out.bookQuotes,[]);
 }
 const good=structuredClone(base);
 good.body.sgps.DraftKings=[quote];
 const stale=nflSgpSnapshotReadiness({...good,at:now-16*60_000},{now,gameId});
 assert.equal(stale.sportsbookCombinedOddsVerified,false);
 assert.deepEqual(stale.bookQuotes,[]);
});
test('stale or wrong-game snapshots cannot surface saved SGP candidates as ready',()=>{
 const old=sample(now-16*60_000);
 old.body.sgps.Analytics[0]={risk:'Small',requiredLegs:4,legs:[{playerId:'1'},{playerId:'2'},{playerId:'3'},{playerId:'4'}],tierAssessment:{compositionOk:true}};
 const status=nflSgpSnapshotReadiness(old,{now,gameId});
 assert.equal(status.status,'STALE');
 assert.equal(status.tiers[0].status,'STALE');
 assert.equal(status.tiers[0].legCount,0);
 assert.equal(nflSgpSnapshotReadiness(sample(),{now,gameId:'999999999'}).status,'UNVERIFIED_SNAPSHOT');
});
test('read-only Blob handler differentiates empty cache from storage outage',async()=>{
 let blobCalls=0,fetchCalls=0;
 const missing=await nflSgpReadinessFromBlob({date,gameId,now,
  listBlobs:async ({prefix,limit})=>{
   blobCalls++;assert.equal(limit,5);assert.ok(prefix.endsWith(gameId+'.json'));return{blobs:[]};
  },fetchBlob:async()=>{fetchCalls++;throw Error('should not read')}});
 assert.equal(blobCalls,1);
 assert.equal(fetchCalls,0);
 assert.equal(missing.httpStatus,200);
 assert.equal(missing.result.status,'PENDING_SNAPSHOT');
 const unavailable=await nflSgpReadinessFromBlob({date,gameId,now,
  listBlobs:async()=>{throw Error('private storage down')}});
 assert.equal(unavailable.httpStatus,503);
 assert.equal(unavailable.result.status,'SNAPSHOT_STORAGE_UNAVAILABLE');
 assert.ok(!JSON.stringify(unavailable).includes('private storage down'));
});
test('readable snapshot uses exact filename and sanitized evidence summary without new sport provider calls',async()=>{
 const path=nflSgpSnapshotPath(date,gameId);
 let reads=0;
 const good=await nflSgpReadinessFromBlob({date,gameId,now,
  listBlobs:async()=>({blobs:[{pathname:'other.json',url:'bad'},
   {pathname:path,url:'https://example.com/blob.json'}]}),
  fetchBlob:async url=>{reads++;assert.equal(url,'https://example.com/blob.json');
   return{ok:true,json:async()=>sample()}}});
 assert.equal(good.httpStatus,200);
 assert.equal(good.result.status,'NOT_READY');
 assert.equal(reads,1);
});
test('SGP health route rejects non-read, malformed and historical scanning requests',async()=>{
 const res=()=>({code:200,setHeader(){return this},status(x){this.code=x;return this},json(x){this.data=x;return this}});
 for(const req of [
  {method:'POST',query:{date,gameId}},
  {method:'GET',query:{date:'2026-13-99',gameId}},
  {method:'GET',query:{date,gameId:'../foo'}}
 ]){
  const a=res();await handler(req,a);
  assert.equal(a.code,req.method==='POST'?405:400);
 }
 const old=res();await handler({method:'GET',query:{date:'2000-01-01',gameId}},old);
 assert.equal(old.code,400);
});
test('matchup view shows direct evidence counts and read-only link; keeps sportsbook odds unverified',()=>{
 const s=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(s.includes('SGP evidence check:'));
 assert.ok(s.includes('missingRosterOrGameIdentity'));
 assert.ok(s.includes('Inspect saved SGP health'));
 assert.ok(s.includes('/api/nfl-sgp-status?date='));
 assert.ok(s.includes('no sportsbook credits'));
 const api=readFileSync(new URL('../api/nfl-sgp-status.js',import.meta.url),'utf8');
 assert.ok(!/SPORTSGAMEODDS_API_KEY|THE_ODDS_API_KEY|GROQ_API_KEY|BALLDONTLIE_API_KEY/.test(api));
 assert.ok(api.includes("req.method!=='GET'"));
});
