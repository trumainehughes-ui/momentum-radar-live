import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildNflSlateRankings,nflSlateSnapshotPrefix,
 nflSlateSnapshotPathValid,nflSlateSnapshotGameId,nflSlateNewestSnapshotBlobs,
 NFL_MARKET_RESPONSE_SCHEMA}
 from '../lib/nfl-slate-rankings.js';

const date='2026-10-11',now=Date.parse('2026-10-11T19:50:00Z');
const person=(id,gameId,cat,projection,extra={})=>({
 playerID:String(id),eventID:String(gameId),name:'Athlete '+id,team:'DEN',
 position:cat==='passing'?'QB':'RB',projection,perGame:projection-3,
 confidence:68,gamesPlayed:4,rank:1,books:[],analyticsOnly:true,
 ...extra
});
const snap=(id,cat,arr,extra={})=>({
 at:now-120_000,
 body:{ok:true,date,gameId:String(id),categories:{
  passing:[],rushing:[],receiving:[],receptions:[],[cat]:arr
 },validation:{injuryEligibilityChecked:true},...extra}
});
test('Top 10 composes the actual ranked players from multiple independently screened games',()=>{
 const snapshots=[
  snap('401872989','rushing',[
   person('1','401872989','rushing',90,{name:'Runner DEN',rushingChance:{
    modelTargetYards:70,estimatedPercent:65}}),
   person('2','401872989','rushing',60,{name:'Runner LAC'})]),
  snap('401872991','rushing',[
   person('3','401872991','rushing',120,{name:'Runner DET'}),
   person('4','401872991','rushing',88,{name:'Runner ARI'})]),
  snap('401872990','passing',[person('5','401872990','passing',285,{
   name:'Quarterback GB',team:'GB'})]),
  snap('401872984','receiving',[person('6','401872984','receiving',105,{
   name:'Receiver HOU',team:'HOU'})]),
  snap('401872984','receptions',[person('7','401872984','receptions',8.3,{
   name:'Receiver TEN',team:'TEN'})])
 ];
 const out=buildNflSlateRankings(snapshots,{date,now});
 assert.deepEqual(out.categories.rushing.map(x=>x.name),
  ['Runner DET','Runner DEN','Runner ARI','Runner LAC']);
 assert.deepEqual(out.categories.rushing.map(x=>x.rank),[1,2,3,4]);
 assert.equal(out.categories.rushing[1].rushingChance.estimatedPercent,65);
 assert.equal(out.categories.passing[0].projection,285);
 assert.equal(out.categories.receiving[0].projection,105);
 assert.equal(out.categories.receptions[0].projection,8.3);
 assert.equal(out.gamesWithProjections,4);
 assert.equal(out.injuryScreenedGames,4);
 assert.equal(out.modelOnly,true);
 assert.equal(out.categories.passing[0].books.length,0);
 assert.match(out.note,/not live in-game production/);
});
test('game-scoped identity, injury exclusions and bad projection data fail closed',()=>{
 const bad=[
  person('1','401872989','rushing',110,{injuryStatus:'OUT'}),
  person('2','401872989','rushing',98,{availability:'INACTIVE'}),
  person('3','401872989','rushing',88,{starterStatus:'IR'}),
  person('4','401872988','rushing',140),
  person('5','401872989','rushing',null),
  person('6','401872989','rushing',0),
  person('7','401872989','rushing',-2),
  person('8','401872989','rushing','not a number'),
  person('9','401872989','rushing',70,{name:''}),
  person('10','401872989','rushing',60,{playerID:''}),
  person('11','401872989','rushing',50,{team:''})
 ];
 const out=buildNflSlateRankings([snap('401872989','rushing',bad)],{date,now});
 assert.equal(out.categories.rushing.length,0);
 assert.equal(out.gamesWithProjections,0);
});
test('snapshots for another date and invalid bodies cannot leak player rankings',()=>{
 const good=snap('401872989','passing',[person('1','401872989','passing',245)]);
 const wrong=snap('401872991','passing',[person('2','401872991','passing',280)],{date:'2026-10-12'});
 const invalid=snap('401872993','passing',[person('3','401872993','passing',300)],{ok:false});
 const future={...good,at:now+2*60_000};
 const result=buildNflSlateRankings([wrong,invalid,future,null],{date,now});
 assert.equal(result.gamesWithProjections,0);
 assert.equal(result.categories.passing.length,0);
 assert.equal(buildNflSlateRankings([good],{date,now}).categories.passing.length,1);
});
test('same player cannot appear twice and ordering uses model projected category, not odds',()=>{
 const a=snap('401872989','receiving',[
  person('1','401872989','receiving',78,{confidence:60}),
  person('2','401872989','receiving',90,{confidence:50})]);
 const b=snap('401872991','receiving',[
  person('1','401872991','receiving',78,{confidence:78}),
  person('3','401872991','receiving',95,{confidence:74}),
  person('4','401872991','receiving',65,{injuryStatus:'QUESTIONABLE'})]);
 const out=buildNflSlateRankings([a,b],{date,now,limit:3});
 assert.deepEqual(out.categories.receiving.map(x=>x.playerID),['3','2','1']);
 assert.equal(out.categories.receiving[2].confidence,78);
 assert.equal(out.categories.receiving[2].modelAsOf,new Date(now-120000).toISOString());
 assert.equal(out.categories.receiving[2].snapshotAgeMinutes,2);
});
test('Blob model snapshot matching uses exact selected day and current market schema',()=>{
 const prefix=nflSlateSnapshotPrefix(date);
 assert.ok(prefix.includes(NFL_MARKET_RESPONSE_SCHEMA+'-'+date+'-'));
 assert.equal(nflSlateSnapshotPathValid(prefix+'401872989.json',date),true);
 assert.equal(nflSlateSnapshotPathValid(prefix+'401872989.json','2026-10-12'),false);
 assert.equal(nflSlateSnapshotPathValid(prefix+'not-a-game.json',date),false);
 assert.equal(nflSlateSnapshotPathValid(prefix+'401872989.json.bak',date),false);
 const api=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(api.includes("const SNAP_PREFIX='momentum-nfl-markets/v2/'"));
 assert.ok(api.includes("const CACHE_SCHEMA='v92-strict-nuke-profit-20261011'"));
 assert.ok(api.includes("+'-nuke-roster-adaptive-1-game-identity-2'"));
 assert.ok(api.includes("+'-day-ahead-roles-v5-teamid-depthchart'"));
 assert.ok(api.includes("+'-public-quote-scrub-v1'"));
});
test('slate reads newest immutable snapshot per game, not legacy or older versions',()=>{
 const prefix=nflSlateSnapshotPrefix(date);
 const legacy=prefix+'401872989.json';
 const older=prefix+'401872989/8209999999999-old.json';
 const newer=prefix+'401872989/8209999999998-new.json';
 const other=prefix+'401872990/8209999999997-other.json';
 assert.equal(nflSlateSnapshotPathValid(newer,date),true);
 assert.equal(nflSlateSnapshotGameId(newer,date),'401872989');
 assert.equal(nflSlateSnapshotPathValid(prefix+'401872989/invalid.json',date),false);
 assert.equal(nflSlateSnapshotPathValid(newer,'2026-10-12'),false);
 const chosen=nflSlateNewestSnapshotBlobs([older,other,legacy,newer].map(pathname=>({pathname})),date);
 assert.deepEqual(chosen.map(x=>x.pathname).sort(),[newer,other].sort());
});
test('all four top-ten buttons load read-only slate rows, not metadata-only markets',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const route=readFileSync(new URL('../api/nfl-slate-rankings.js',import.meta.url),'utf8');
 assert.ok(html.includes("fetch('/api/nfl-slate-rankings?'"));
 assert.ok(html.includes('const d=gameId?await getNFLMarkets(gameId):await getNFLSLateRankings()'));
 for(const cat of ['passing','rushing','receiving','receptions'])
  assert.ok(html.includes(cat+':'));
 assert.ok(route.includes('savedGameSnapshots(date)'));
 assert.ok(route.includes('buildNflSlateRankings(snapshots,{date})'));
 assert.ok(route.includes('nflSlateSnapshotPathValid(b.pathname,date)'));
 assert.ok(!route.includes('PLAYER_PROPS_API_KEY'));
 assert.ok(!route.includes('SPORTSGAMEODDS_API_KEY'));
 assert.ok(!route.includes('THE_ODDS_API_KEY'));
});

test('sportsbook-only touchdown prices cannot populate the scoring prediction Top 10',()=>{
 const td=(id,confidence,book,odds)=>person(id,'401872989','td','Anytime TD',{
  confidence,verifiedAt:'2026-10-11T19:48:00Z',
  provider:'The Odds API',marketName:'player_anytime_td',
  bestBook:{book,odds,sourceProvider:'The Odds API',
   checkedAt:'2026-10-11T19:48:00Z',available:true},
  analyticsOnly:false
 });
 const p=snap('401872989','td',[
  td('1',65,'DraftKings',145),
  td('2',80,'FanDuel',-120),
  td('3',55,'Caesars',110),
  td('4',70,'DraftKings',0),
  td('5',72,'DraftKings',null),
  {...td('6',69,'DraftKings',200),verifiedAt:null},
  {...td('7',90,'DraftKings',190),injuryStatus:'INACTIVE'},
  {...td('8',98,'DraftKings',300),bestBook:{book:'DraftKings',odds:300,
   available:true,checkedAt:'2026-10-11T19:48:00Z'}},
  {...td('9',97,'FanDuel',220),provider:'SportsGameOdds'}
 ]);
 const out=buildNflSlateRankings([p],{date,now});
 assert.deepEqual(out.categories.td,[]);
 assert.equal(out.tdRankedScorers,0);
 assert.equal(out.tdRankingMethod,'ESPN_HISTORICAL_TD_USAGE_OPPONENT_DVP_SAMPLE_ADJUSTED');
 assert.equal(out.categories.td[0],undefined);
 assert.equal(out.tdMarketVerificationRequired,true);
 assert.equal(out.verifiedTdOffers,0);
 assert.equal(out.categoryGameCounts.td,0);
});
test('injury-screened TD model candidates rank across different NFL games without fabricated bookmaker odds',()=>{
 const good=(id,game,percent)=>person(id,game,'td','Anytime TD',{
  name:'Touchdown Model '+id,team:'BUF',modelTdPercent:percent,
  modelOnly:true,tdModelStatus:'ESPN_MATCHUP_MODEL',
  evidence:{games:5,opportunitiesPerGame:12,touchdowns:2},
  analyticsOnly:true,books:[],bestBook:null
 });
 const p=snap('401872989','td',[
  good('23','401872989',43),
  good('24','401872989',58),
  {...good('25','401872989',75)},
  {...good('26','401872989',40),evidence:{games:1,opportunitiesPerGame:12}},
  {...good('27','401872989',60),injuryStatus:'OUT'}
 ]);
 const q=snap('401872990','td',[good('28','401872990',64)]);
 const out=buildNflSlateRankings([p,q],{date,now});
 assert.deepEqual(out.categories.td.map(x=>x.playerID),['28','24','23']);
 assert.ok(out.categories.td.every(x=>x.bestBook===null&&x.analyticsOnly===true));
 assert.equal(out.tdModelCandidatesAllowed,true);
 assert.equal(out.verifiedTdOffers,0);
 assert.equal(out.categoryGameCounts.td,2);
 assert.ok(out.categories.td.every(x=>x.verifiedIndividualOffer===false));
 assert.equal(out.tdMarketVerificationRequired,true);
});
test('unverified roster/injury evidence cannot populate even model-only rankings',()=>{
 const games=[snap('401872989','rushing',[
  person('1','401872989','rushing',95)
 ],{validation:{injuryEligibilityChecked:false}})];
 const out=buildNflSlateRankings(games,{date,now});
 assert.equal(out.gamesWithProjections,0);
 assert.equal(out.injuryScreenedGames,0);
 assert.deepEqual(out.categories.rushing,[]);
});
test('Anytime TD empty state is an honest verification warning, not an endless loading message',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const lib=readFileSync(new URL('../lib/nfl-slate-rankings.js',import.meta.url),'utf8');
 assert.ok(html.includes('No individually verified DraftKings/FanDuel Anytime TD markets'));
 assert.ok(html.includes('No screened Anytime TD model yet; sportsbook odds unverified.'));
 assert.ok(html.includes('Oldest saved snapshot:'));
 assert.ok(lib.includes("'td','passing','rushing','receiving','receptions'"));
 const out=buildNflSlateRankings([
  snap('401872989','rushing',[person('1','401872989','rushing',70)])
 ],{date,now});
 assert.deepEqual(out.categories.td,[]);
});

test('expired saved player-book odds are removed from model rankings, and expired TD offers are excluded',()=>{
 const oldSnap=snap('401872989','rushing',[
  person('1','401872989','rushing',91,{
   verifiedAt:new Date(now-17*60_000).toISOString(),
   bestBook:{book:'DraftKings',line:89.5,odds:-110},
   bookOffer:{book:'DraftKings',line:89.5,odds:-110},
   sportsbooks:{DraftKings:{book:'DraftKings',line:89.5,odds:-110}}
  })
 ]);
 oldSnap.at=now-17*60_000;
 const tdSnap=snap('401872991','td',[
  person('2','401872991','td','Anytime TD',{
   verifiedAt:new Date(now-20*60_000).toISOString(),
   bestBook:{book:'FanDuel',odds:155}
  })
 ]);
 tdSnap.at=now-20*60_000;
 const result=buildNflSlateRankings([oldSnap,tdSnap],{date,now});
 assert.equal(result.categories.rushing.length,1);
 assert.equal(result.categories.rushing[0].bestBook,null);
 assert.equal(result.categories.rushing[0].bookOffer,null);
 assert.deepEqual(result.categories.rushing[0].books,[]);
 assert.deepEqual(result.categories.rushing[0].sportsbooks,{});
 assert.deepEqual(result.categories.td,[]);
});

test('Sunday scorer Top 10 selects the ten highest qualified candidates across twelve matchups',()=>{
 const scores=Array.from({length:12},(_,i)=>{
  const gid=String(401873100+i);
  const player=person('td-'+i,gid,'td','Anytime TD',{
   name:'Scorer '+i,team:'ATL',opponent:'CHI',position:'RB',
   modelOnly:true,tdModelStatus:'ESPN_MATCHUP_MODEL',
   modelTdPercent:35+2*i,confidence:71,
   evidence:{games:6,opportunitiesPerGame:12,touchdowns:3},
   bestBook:null,books:[]});
  const game=snap(gid,'td',[player]);
  game.body.home='CHI';game.body.away='ATL';
  return game;
 });
 const result=buildNflSlateRankings(scores,{date,now});
 assert.equal(result.categoryGameCounts.td,12);
 assert.equal(result.tdRankedScorers,10);
 assert.equal(result.verifiedTdOffers,0);
 assert.equal(result.categories.td[0].name,'Scorer 11');
 assert.equal(result.categories.td[9].name,'Scorer 2');
 assert.equal(new Set(result.categories.td.map(x=>x.gameId)).size,10);
 assert.ok(result.categories.td.every(x=>x.scorerPrediction&&x.bestBook===null));
 assert.ok(result.categories.td.every(x=>x.rank>=1&&x.rank<=10));
});
test('current weekly injury holds remove otherwise high-ranked Sunday touchdown candidates',()=>{
 const gid='401873199';
 const make=(id,pct)=>person(id,gid,'td','Anytime TD',{
  name:'Scoring Player '+id,team:'ATL',opponent:'CHI',position:'RB',
  modelOnly:true,tdModelStatus:'ESPN_MATCHUP_MODEL',modelTdPercent:pct,
  evidence:{games:5,opportunitiesPerGame:12,touchdowns:3}});
 const snapshot=snap(gid,'td',[make('1',70),make('2',55),make('3',46)],
  {home:'CHI',away:'ATL',validation:{injuryEligibilityChecked:true,
   injuryEvidence:[{playerId:'1',name:'Scoring Player 1',team:'ATL',
    status:'QUESTIONABLE',section:'WEEKLY'}]}});
 const ranked=buildNflSlateRankings([snapshot],{date,now});
 assert.deepEqual(ranked.categories.td.map(x=>x.playerID),['2','3']);
 const unrelated=snap(gid,'td',[make('2',55)],{home:'CHI',away:'HOU'});
 assert.equal(buildNflSlateRankings([unrelated],{date,now}).categories.td.length,0);
});
test('TD scorer sample reliability beats marginally higher raw percentage from two games',()=>{
 const gid='401873198';
 const td=(id,pct,games)=>person(id,gid,'td','Anytime TD',{
  team:'ATL',position:'RB',modelOnly:true,tdModelStatus:'ESPN_MATCHUP_MODEL',
  modelTdPercent:pct,evidence:{games,opportunitiesPerGame:12,touchdowns:2}});
 const rank=buildNflSlateRankings([snap(gid,'td',[td('1',50,2),td('2',49,8)])],{date,now});
 assert.deepEqual(rank.categories.td.map(x=>x.playerID),['2','1']);
 assert.ok(rank.categories.td[0].tdRankScore>rank.categories.td[1].tdRankScore);
});


test('Sunday TD standings reject questionable, PUP, NFI and probable player-level status without an injury detail row',()=>{
 const gameId='401873177';
 const entry=(id,field,status)=>person(String(id),gameId,'td','Anytime TD',{
  name:'Candidate '+id,team:'BUF',position:'RB',
  modelOnly:true,tdModelStatus:'ESPN_MATCHUP_MODEL',modelTdPercent:68-id,
  evidence:{games:6,opportunitiesPerGame:12,touchdowns:5},
  ...(field?{[field]:status}:{})
 });
 const rows=[
  entry(1,'injuryStatus','Questionable'),
  entry(2,'starterStatus','PUP'),
  entry(3,'availability','NFI'),
  entry(4,'injuryStatus','Probable'),
  entry(5,'availability','ACTIVE'),
  entry(6,'availability','INACTIVE'),
  entry(7,'injuryStatus','Injured Reserve')
 ];
 const result=buildNflSlateRankings([snap(gameId,'td',rows)],{date,now});
 assert.deepEqual(result.categories.td.map(x=>x.playerID),['5']);
 assert.equal(result.verifiedTdOffers,0);
 assert.equal(result.categoryGameCounts.td,1);
});
