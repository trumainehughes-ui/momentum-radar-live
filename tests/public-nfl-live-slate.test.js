import test from 'node:test';
import assert from 'node:assert/strict';
import {nflLiveSlateGames,buildNflLiveSlate,readNflLiveGame} from '../api/public-nfl-live-slate.js';

const day='2026-10-18',now=Date.parse('2026-10-18T17:30:00Z');
const game=(id,status,away='HOU',home='JAX')=>({
 id,date:'2026-10-18T17:00:00Z',status:{type:{
  state:status==='FINAL'?'post':status==='LIVE'?'in':'pre',
  description:status==='FINAL'?'Final':status==='LIVE'?'In Progress':'Scheduled',
  shortDetail:status==='FINAL'?'Final':status==='LIVE'?'Q2 06:12':'1:00 PM ET'
 }},
 competitions:[{competitors:[
 {homeAway:'away',team:{abbreviation:away,displayName:away+' Visitors'},score:7},
 {homeAway:'home',team:{abbreviation:home,displayName:home+' Home'},score:0}
 ]}]
});
const scoreboard={events:[
 game('401872996','FINAL'),
 game('401872999','LIVE','CHI','ATL'),
 game('401873003','SCHEDULED','TEN','IND')
]};
const fetcher=async(url,opts)=>{
 assert.equal(url,'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=20261018&limit=100');
 assert.equal(opts.cache,'no-store');
 return{ok:true,json:async()=>scoreboard};
};
const safeResponse=(id,scorers)=>({ok:true,gameId:id,status:'Final',
 fetchedAt:new Date(now).toISOString(),
 touchdowns:scorers.map((p,i)=>({name:p,star:i===0,
  text:'Q2 play by '+p+', TOUCHDOWN. https://example.invalid/private',
  period:2,clock:'06:12'}))});
const handler=records=>async(req,res)=>{
 const id=req.query.gameId;records.push(id);
 return res.status(200).json(id==='401872996'?
  safeResponse(id,['First Scorer','First Scorer']):safeResponse(id,['Second Scorer']));
};
test('scoreboard includes final, live and future NFL games with actual scores (including zero)',()=>{
 const games=nflLiveSlateGames(scoreboard);
 assert.equal(games.length,3);
 assert.deepEqual(games.map(x=>x.status),['FINAL','LIVE','SCHEDULED']);
 assert.equal(games[0].away.score,7);
 assert.equal(games[0].home.score,0);
 assert.equal(games[1].away.abbr,'CHI');
});
test('slate collects every final/live scoring play, counts repeat TD scorers separately, preserves locked stars and game status',async()=>{
 const calls=[];
 const d=await buildNflLiveSlate({date:day,now,fetcher,gameHandler:handler(calls)});
 assert.equal(d.ok,true);
 assert.equal(d.date,day);
 assert.equal(d.source,'ESPN_OFFICIAL_SCORING_PLAYS');
 assert.equal(d.coverage,'COMPLETE');
 assert.equal(d.totals.games,3);
 assert.equal(d.totals.touchdowns,3);
 assert.equal(d.totals.scoringGames,2);
 assert.deepEqual(d.totals,{games:3,touchdowns:3,scoringGames:2,
  live:1,final:1,upcoming:1,unavailable:0});
 assert.deepEqual(calls.sort(),['401872996','401872999']);
 assert.deepEqual(d.games[0].touchdowns.map(x=>x.name),['First Scorer','First Scorer']);
 assert.equal(d.games[0].touchdowns[0].star,true);
 assert.equal(d.games[0].touchdowns[1].star,false);
 assert.equal(d.games[1].touchdowns[0].name,'Second Scorer');
 assert.equal(d.games[2].touchdownCount,0);
 assert.equal(d.games[2].sourceStatus,'NOT_STARTED');
 assert.equal(JSON.stringify(d).includes('example.invalid'),false);
});
test('failed ESPN game detail is UNKNOWN, not falsely shown as zero touchdowns',async()=>{
 const partial=await buildNflLiveSlate({date:day,now,fetcher,gameHandler:async(req,res)=>{
  if(req.query.gameId==='401872996')return res.status(503).json({ok:false});
  return res.status(200).json(safeResponse(req.query.gameId,['Known touchdown']));
 }});
 assert.equal(partial.coverage,'PARTIAL');
 assert.equal(partial.totals.unavailable,1);
 assert.equal(partial.games[0].touchdownCount,null);
 assert.equal(partial.games[0].sourceStatus,'SCORING_FEED_UNAVAILABLE');
 assert.equal(partial.totals.touchdowns,1);
});
test('untrusted scoring response for wrong game is ignored',async()=>{
 const wrong=await readNflLiveGame('401872996',async(req,res)=>
  res.status(200).json(safeResponse('401872998',['Wrong-game scorer'])));
 assert.equal(wrong,null);
});
test('invalid ESPN event IDs, missing competitors and scorerless scheduled games cannot impersonate TD plays',()=>{
 const rows=nflLiveSlateGames({events:[
  {id:'malicious',competitions:[{competitors:[]}]},
  {id:'401872995',competitions:[{competitors:[]}]},
  game('401872999','SCHEDULED')
 ]});
 assert.equal(rows.length,1);
 assert.equal(rows[0].gameId,'401872999');
});
