import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {eligibleNflSlateRefreshGames,runNflSlateSgpRefresh,
 summarizeNflGameRefresh,NFL_SLATE_REFRESH_MAX_GAMES}
 from '../lib/nfl-slate-sgp-refresh.js';
const now=Date.parse('2026-10-11T05:00:00Z');
const fake=(i,offset=36000000)=>({gameId:String(401800000+i),
 kickoff:new Date(now+offset).toISOString(),status:'SCHEDULED',
 away:{abbr:'AWY'},home:{abbr:'HME'}});
function sample(g,{book=true,at=now+2000}={}){
 const risks=['Small','Medium','Nuke'];
 return{ok:true,gameId:g.gameId,fetchedAt:new Date(at).toISOString(),
  degraded:false,validation:{injuryEligibilityChecked:true},
  sgps:{Analytics:risks.map(risk=>({risk,requiredLegs:risk==='Small'?4:5,
   tierAssessment:{compositionOk:true},
   legs:Array.from({length:risk==='Small'?4:5},(_,i)=>({name:'Player '+i}))}))},
  sportsbookCoverage:{books:{
   DraftKings:{pricedSelections:book?12:0,pricedAlternateSelections:book?7:0},
   FanDuel:{pricedSelections:book?9:0,pricedAlternateSelections:book?4:0}
  }}};
}
test('full-slate selector only refreshes distinct, upcoming real ESPN games within 36h and caps expensive requests',()=>{
 const games=[fake(1),fake(1),fake(2,-30*60*1000),
  {...fake(3),status:'FINAL'},fake(4,48*3600000),
  {gameId:'../../admin',kickoff:new Date(now+3600000).toISOString(),status:'SCHEDULED'},
  ...Array.from({length:24},(_,i)=>fake(i+10))];
 const due=eligibleNflSlateRefreshGames(games,{now});
 assert.equal(due.length,NFL_SLATE_REFRESH_MAX_GAMES);
 assert.ok(due.every(g=>/^\d{9}$/.test(g.gameId)));
 assert.ok(due.every(g=>g.status==='SCHEDULED'));
});
test('all-slate refresh uses two workers max, tracks BOTH books and all 3 model tiers without asserting combined odds',async()=>{
 const games=Array.from({length:9},(_,i)=>fake(i+1));
 let inFlight=0,peak=0,calls=0;
 const progress=[];
 const result=await runNflSlateSgpRefresh(games,async id=>{
  inFlight++;peak=Math.max(peak,inFlight);calls++;
  await new Promise(r=>setTimeout(r,2));
  inFlight--;
  const g=games.find(g=>g.gameId===id);
  return sample(g,{book:true,at:now});
 },{now,onProgress:p=>progress.push(p)});
 assert.equal(calls,9);
 assert.equal(peak,2);
 assert.equal(result.attempted,9);
 assert.equal(result.complete,9);
 assert.equal(result.modelCandidateGames,9);
 assert.equal(result.bothBookPricedGames,9);
 assert.equal(result.combinedBookQuoteVerified,0);
 assert.equal(progress.at(-1).finished,9);
 assert.equal(result.games.every(x=>x.tiers.Small==='MODEL_CANDIDATE'&&
  x.tiers.Medium==='MODEL_CANDIDATE'&&x.tiers.Nuke==='MODEL_CANDIDATE'),true);
 assert.equal(result.games.every(x=>x.actualCombinedSgpOddsVerified===false),true);
});
test('no sportsbook credits or empty data cannot be reported as a successful price refresh',async()=>{
 const games=[fake(1),fake(2),fake(3)];
 const outcome=await runNflSlateSgpRefresh(games,async id=>{
  if(id===games[0].gameId)return sample(games[0],{book:false,at:now});
  if(id===games[1].gameId)throw Error('odds_api_quota_cooldown');
  return sample(games[2],{book:true,at:now-17*60000});
 },{now});
 assert.equal(outcome.bothBookPricedGames,0);
 assert.equal(outcome.sourcePending,2);
 assert.equal(outcome.games[0].status,'MODEL_ONLY');
 assert.equal(outcome.games[1].status,'REFRESH_FAILED');
 assert.equal(outcome.games[2].status,'SOURCE_PENDING');
 assert.equal(outcome.combinedBookQuoteVerified,0);
 assert.ok(outcome.games.every(x=>x.actualCombinedSgpOddsVerified===false));
});
test('wrong-matchup, old and malformed responses cannot certify new data',()=>{
 const game=fake(1);
 for(const data of [
  {...sample(game,{at:now}),gameId:'401899999'},
  sample(game,{at:now-17*60000}),
  {...sample(game,{at:now}),degraded:true},
  {ok:false,gameId:game.gameId},
  null
 ]){
  const r=summarizeNflGameRefresh(game,data,{now});
  assert.equal(r.status,'SOURCE_PENDING');
  assert.equal(r.actualCombinedSgpOddsVerified,false);
 }
});
test('NFL UI exposes explicit all-games actual SGP rebuild, bounded workers, and independently disclosed DK/FD coverage',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="nflRefreshAllSgps">Rebuild all upcoming SGPs/);
 assert.match(html,/async function nflRefreshAllSgpCandidates\(\)/);
 assert.match(html,/const d=await getNFLMarkets\(g.gameId,false\)/);
 assert.match(html,/await Promise\.all\(\[worker\(\),worker\(\)\]\)/);
 assert.match(html,/entry\[book\]=Math\.max\(0,Number\(d\.sportsbookCoverage/);
 assert.match(html,/Actual correlated SGP odds: NOT VERIFIED/);
 assert.ok(html.includes(String.raw`if(!/^\d{7,12}$/.test(gameId)`));
});
