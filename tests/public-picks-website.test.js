import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {publicNflGameView} from '../lib/public-nfl-view.js';
const date='2026-10-12',gameId='401872990',now=Date.parse('2026-10-12T20:30:00Z');
const td={name:'Sample RB',playerID:'11',eventID:gameId,team:'BUF',
 position:'RB',tdModelStatus:'ESPN_MATCHUP_MODEL',modelOnly:true,
 modelTdPercent:47,gamesPlayed:5,
 evidence:{games:5,opportunitiesPerGame:15.2,touchdowns:4,
  defenseRank:null,bookOutcomeId:'secret-provider-outcome'}};
const yards=(cat,id,n)=>({name:'Sample '+cat,playerID:id,eventID:gameId,
 team:cat==='receiving'?'LAR':'BUF',position:cat==='passing'?'QB':'WR',
 category:cat,projection:n,gamesPlayed:7,verifiedAt:new Date(now).toISOString(),
 books:[{book:'DraftKings',odds:110,bookOutcomeId:'private-book-id'}]});
const leg=(cat,id,target,team='BUF')=>({
 name:'Player '+id,playerID:id,eventID:gameId,team,cat,analyticsThreshold:target
});
const small=[leg('passing','1',225),leg('rushing','2',65),
 leg('receiving','3',75,'LAR'),leg('td','11','Anytime TD')];
const medium=[...small,leg('receptions','4',5)];
const nuke=[leg('passing','1',300),leg('rushing','2',100),
 leg('receiving','3',110,'LAR'),leg('receptions','4',8),
 leg('td','11','Anytime TD')];
function sample(){
 return{at:now-60_000,body:{
  ok:true,date,gameId,home:'LAR',away:'BUF',
  validation:{injuryEligibilityChecked:true,blockedPlayerCount:2,
   injuryEvidence:[{name:'Secret injury',source:'internal'}]},
  oddsDebug:{quotaRemaining:2,apiKey:'secret-key'},
  categories:{td:[td],passing:[yards('passing','1',275)],
   rushing:[yards('rushing','2',95)],
   receiving:[yards('receiving','3',82)],
   receptions:[yards('receptions','4',6)]},
  sgps:{Analytics:[
   {risk:'Small',legs:small,requiredLegs:4,tierAssessment:{compositionOk:true},
    quoteRequest:{providerEventId:'SECRET_PROVIDER_EVENT'}},
   {risk:'Medium',legs:medium,requiredLegs:5,tierAssessment:{compositionOk:true}},
   {risk:'Nuke',legs:nuke,requiredLegs:5,tierAssessment:{compositionOk:true}}
  ],DraftKings:[{book:'DraftKings',risk:'Small',legs:small,requiredLegs:4,
   actualSgpOdds:250,combinedBookQuoteVerified:true,
   publishable:true,bookVerificationPending:false,
   quotedAt:new Date(now-80_000).toISOString()}],FanDuel:[]}
 }};
}
test('public game view returns only consumer player forecasts and qualified tier legs',()=>{
 const v=publicNflGameView(sample(),{date,gameId,now});
 assert.equal(v.status,'CURRENT');
 assert.equal(v.categories.td[0].modelChancePct,47);
 assert.equal(v.categories.td[0].opponentTdRank,null);
 assert.equal(v.categories.passing[0].projection,275);
 assert.equal(v.categories.receiving[0].projection,80);
 assert.deepEqual(v.parlays.map(x=>x.risk),['Small','Medium','Nuke']);
 assert.deepEqual(v.parlays.map(x=>x.legCount),[4,5,5]);
 assert.equal(v.parlays[0].legs.at(-1).target,'Anytime TD');
 assert.equal(v.parlays[0].combinedOddsVerified,false);
 assert.equal(v.bookmakerTicketPlaced,false);
 assert.equal(v.verifiedQuotes[0].americanOdds,250);
 const shown=JSON.stringify(v);
 for(const secret of ['quoteRequest','bookOutcomeId','SECRET_PROVIDER_EVENT',
  'secret-key','quotaRemaining','injuryEvidence','source','providerEventId',
  'private-book-id','playerID','oddsDebug'])
  assert.ok(!shown.includes(secret),secret);
});
test('stale models and missing eligibility never publish current props or prices',()=>{
 let s=sample();s.at=now-16*60_000;
 let v=publicNflGameView(s,{date,gameId,now});
 assert.equal(v.status,'STALE');
 assert.deepEqual(v.parlays,[]);
 assert.deepEqual(v.verifiedQuotes,[]);
 assert.ok(Object.values(v.categories).every(x=>x.length===0));
 s=sample();s.body.validation.injuryEligibilityChecked=false;
 v=publicNflGameView(s,{date,gameId,now});
 assert.equal(v.status,'REVIEW');
 assert.ok(Object.values(v.categories).every(x=>x.length===0));
});
test('wrong opponent, injury holds, bad model numerics and invalid player targets cannot show',()=>{
 const s=sample();
 s.body.categories.td.push({...td,name:'Wrong opponent',playerID:'12',team:'KC'});
 s.body.categories.td.push({...td,name:'Questionable',playerID:'13',injuryStatus:'QUESTIONABLE'});
 s.body.categories.td.push({...td,name:'No support',playerID:'14',modelTdPercent:99});
 s.body.categories.rushing.push({...yards('rushing','45',95),injuryStatus:'OUT'});
 s.body.sgps.Analytics[1].legs[0].analyticsThreshold=227;
 s.body.sgps.Analytics[2].legs[0].team='KC';
 const v=publicNflGameView(s,{date,gameId,now});
 assert.equal(v.categories.td.length,1);
 assert.equal(v.categories.rushing.length,1);
 assert.deepEqual(v.parlays.map(x=>x.risk),['Small']);
 s.body.gameId='401872991';
 assert.equal(publicNflGameView(s,{date,gameId,now}).status,'UNAVAILABLE');
});
test('public website has a shareable rewrite and never includes owner engineering views',()=>{
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.ok(config.rewrites.some(x=>x.source==='/picks'&&x.destination==='/picks.html'));
 const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 assert.match(html,/Momentum Radar \| Game-day Insights/);
 assert.match(html,/api\/public-nfl-game/);
 assert.match(html,/api\/public-nfl-rankings/);
 assert.match(html,/Same Game Parlays/);
 assert.match(html,/Anytime Touchdown Radar/);
 assert.match(html,/Small \/ Medium \/ Nuke/);
 assert.ok(!html.includes('API credits'));
 assert.ok(!html.includes('admin dashboard'));
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script&&script.includes('loadSlate(true)'));
 assert.doesNotThrow(()=>new vm.Script(script,{filename:'public-site.js'}));
 const route=readFileSync(new URL('../api/public-nfl-game.js',import.meta.url),'utf8');
 assert.match(route,/nflSgpSnapshotPath/);
 assert.ok(!route.includes('/api/nfl-markets?'));
 assert.ok(!route.includes('SPORTSGAMEODDS_API_KEY'));
 assert.ok(!route.includes('GROQ_API_KEY'));
 const rankRoute=readFileSync(new URL('../api/public-nfl-rankings.js',import.meta.url),'utf8');
 assert.ok(!rankRoute.includes('THE_ODDS_API_KEY'));
 assert.ok(!rankRoute.includes('SPORTSGAMEODDS_API_KEY'));
});
