import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflReadinessRow,nflReadinessTotals} from '../lib/nfl-sgp-readiness-board.js';
const day='2026-10-18',now=Date.parse('2026-10-18T16:00:00Z');
const game={gameId:'401872999',home:{abbr:'ATL'},away:{abbr:'CHI'},
 kickoff:'2026-10-18T17:00:00Z',status:'SCHEDULED'};
const sample=(updates={})=>({ok:true,date:day,gameId:game.gameId,
 checkedAt:new Date(now-30000).toISOString(),status:'MODEL_ONLY',
 sportsbookCombinedOddsVerified:false,
 tiers:[{risk:'Small',status:'MODEL_CANDIDATE',legCount:3},
 {risk:'Medium',status:'MODEL_CANDIDATE',legCount:4},
 {risk:'Large',status:'MODEL_CANDIDATE',legCount:5},
 {risk:'Nuke',status:'MODEL_CANDIDATE',legCount:5}],
 bookPricing:{status:'FIRST_PARTY_PUBLIC_RESEARCH_NO_AUTHENTICATED_SGP_QUOTE'},
 bookQuotes:[],...updates});
test('all four mixed model research tiers are visible without pretending correlated SGP odds exist',()=>{
 const row=nflReadinessRow(game,sample(),{now,date:day});
 assert.equal(row.modelReadyCount,4);
 assert.equal(row.pricedTierCount,0);
 assert.equal(row.matchup,'CHI @ ATL');
 assert.equal(row.sourceStatus,'FIRST_PARTY_PUBLIC_RESEARCH_NO_AUTHENTICATED_SGP_QUOTE');
 assert.deepEqual(row.tiers.map(x=>x.modelLegs),[3,4,5,5]);
});
test('a claimed quote without readiness attestation cannot become bookmaker-priced',()=>{
 const quote=[{gameId:game.gameId,date:day,book:'DraftKings',risk:'Nuke',americanOdds:10000}];
 const bad=nflReadinessRow(game,sample({bookQuotes:quote}),{now,date:day});
 assert.equal(bad.pricedTierCount,0);
 const good=nflReadinessRow(game,sample({bookQuotes:quote,
  sportsbookCombinedOddsVerified:true}),{now,date:day});
 assert.equal(good.pricedTierCount,1);
 assert.deepEqual(good.tiers.find(x=>x.risk==='Nuke').quotedBooks,['DraftKings']);
 const wrongBand=nflReadinessRow(game,sample({bookQuotes:[{
  gameId:game.gameId,date:day,book:'DraftKings',risk:'Nuke',americanOdds:9999
 }],sportsbookCombinedOddsVerified:true}),{now,date:day});
 assert.equal(wrongBand.pricedTierCount,0);
});
test('duplicate book quote metadata never counts twice and no model-only odds are guessed',()=>{
 const q={gameId:game.gameId,date:day,book:'DraftKings',risk:'Small',americanOdds:200};
 const row=nflReadinessRow(game,sample({sportsbookCombinedOddsVerified:true,
  bookQuotes:[q,q,{...q,book:'FanDuel'}]}),{now,date:day});
 assert.equal(row.pricedTierCount,1);
 assert.deepEqual(row.tiers[0].quotedBooks,['DraftKings','FanDuel']);
 assert.equal(row.tiers[2].bookmakerPriced,false);
});
test('wrong game, wrong date, expired or unverified snapshot never appears current or priced',()=>{
 for(const payload of [
  {gameId:'401872998'}, {date:'2026-10-19'},
  {checkedAt:new Date(now-16*60000).toISOString()},
  {checkedAt:new Date(now+61000).toISOString()},
  {status:'STALE'}
 ]){
  const row=nflReadinessRow(game,sample({...payload,
   sportsbookCombinedOddsVerified:true,
   bookQuotes:[{gameId:game.gameId,date:day,book:'DraftKings',risk:'Small',americanOdds:200}]}),{now,date:day});
  assert.equal(row.modelReadyCount,0,JSON.stringify(payload));
  assert.equal(row.pricedTierCount,0,JSON.stringify(payload));
  assert.notEqual(row.snapshotStatus,'CURRENT');
 }
});
test('aggregate coverage never claims all games ready when any scoped snapshot fails',()=>{
 const clean=nflReadinessRow(game,sample(),{now,date:day});
 const expired=nflReadinessRow({...game,gameId:'401872998'},
  sample({gameId:'401872998',status:'STALE'}),{now,date:day});
 assert.deepEqual(nflReadinessTotals([clean,expired]),{
  games:2,checked:1,modelReady:4,modelPossible:8,
  pricedTiers:0,pricedGames:0,notCurrent:1});
});
test('operator readiness calculations are retained but the unprotected static page is withheld from Phase 1',()=>{
 const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const publicHtml=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 assert.equal(home.includes('href="/nfl-sgp-readiness.html"'),false);
 assert.equal(publicHtml.includes('href="/nfl-sgp-readiness.html"'),false);
});

test('a quoted tier with failed model validation is not advertised as priced',()=>{
 const report=sample({
  sportsbookCombinedOddsVerified:true,
  tiers:[{risk:'Small',status:'REVIEW',legCount:3}],
  bookQuotes:[{gameId:game.gameId,date:day,book:'DraftKings',risk:'Small',americanOdds:200}]
 });
 const row=nflReadinessRow(game,report,{now,date:day});
 assert.equal(row.tiers[0].modelReady,false);
 assert.equal(row.tiers[0].bookmakerPriced,false);
 assert.deepEqual(row.tiers[0].quotedBooks,[]);
 assert.equal(row.pricedTierCount,0);
});

test('a quote for another game cannot price this matchup',()=>{
 const row=nflReadinessRow(game,sample({sportsbookCombinedOddsVerified:true,
  bookQuotes:[{gameId:'OTHER_GAME',date:day,book:'DraftKings',risk:'Nuke',americanOdds:2000}]}),{now,date:day});
 assert.equal(row.pricedTierCount,0);
 assert.equal(row.tiers.find(t=>t.risk==='Nuke').bookmakerPriced,false);
});

test('quote from a conflicting game date cannot verify the tier',()=>{
 const row=nflReadinessRow(game,sample({sportsbookCombinedOddsVerified:true,
  bookQuotes:[{gameId:game.gameId,date:'2026-10-19',book:'DraftKings',risk:'Nuke',americanOdds:2000}]}),{now,date:day});
 assert.equal(row.pricedTierCount,0);
});

test('Large is independently represented and requires its canonical payout band',()=>{
 const row=nflReadinessRow(game,sample({sportsbookCombinedOddsVerified:true,
  bookQuotes:[{gameId:game.gameId,date:day,book:'FanDuel',risk:'Large',americanOdds:1000}]}),{now,date:day});
 assert.deepEqual(row.tiers.map(t=>t.risk),['Small','Medium','Large','Nuke']);
 assert.equal(row.tiers.find(t=>t.risk==='Large').bookmakerPriced,true);
 assert.equal(row.pricedTierCount,1);
});

test('readiness pricing follows the canonical tier boundaries',()=>{
 for(const [risk,valid,invalid] of [
  ['Small',100,99],['Medium',301,300],
  ['Large',801,800],['Nuke',10000,9999]
 ]){
  const quote=odds=>({gameId:game.gameId,date:day,book:'DraftKings',risk,americanOdds:odds});
  const priced=nflReadinessRow(game,sample({sportsbookCombinedOddsVerified:true,bookQuotes:[quote(valid)]}),{now,date:day});
  const rejected=nflReadinessRow(game,sample({sportsbookCombinedOddsVerified:true,bookQuotes:[quote(invalid)]}),{now,date:day});
  assert.equal(priced.tiers.find(x=>x.risk===risk).bookmakerPriced,true,risk);
  assert.equal(rejected.tiers.find(x=>x.risk===risk).bookmakerPriced,false,risk);
 }
});

test('quote missing a date cannot certify an otherwise matching NFL game',()=>{
 const row=nflReadinessRow(game,sample({sportsbookCombinedOddsVerified:true,
  bookQuotes:[{gameId:game.gameId,book:'DraftKings',risk:'Small',americanOdds:200}]}),{now,date:day});
 assert.equal(row.pricedTierCount,0);
});

test('saved NFL quote serialization preserves event date through readiness response',()=>{
 const snapshotSource=readFileSync(new URL('../lib/nfl-sgp-snapshot-status.js',import.meta.url),'utf8');
 assert.match(snapshotSource,/date:String\(raw\.date\|\|''\)/);
 assert.match(snapshotSource,/bookQuotes:\(result\.bookQuotes\|\|\[\]\)\.map\(q=>\(\{\.\.\.q,gameId:String\(gameId\),date\}\)\)/);
});
