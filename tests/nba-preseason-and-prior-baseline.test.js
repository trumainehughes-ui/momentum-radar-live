import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nbaPrepareEvidence,nbaBuildPregameModels,nbaRosterEvidence} from '../lib/nba-pregame-model.js';
import {nbaPregameStage,NBA_PREGAME_MODEL_VERSION} from '../api/nba-health.js';
const fixture=(seasonType=2,gameId='401911111')=>({
 gameId,kickoff:'2026-10-20T23:00:00Z',seasonYear:2027,seasonType,
 stage:seasonType===1?'PRESEASON':'REGULAR SEASON',
 home:{id:'2',abbr:'BOS'},away:{id:'16',abbr:'MIA'},
 injuries:[{name:'BOS player 0',team:'BOS',status:'Day-To-Day'}]
});
const dataMock=(calls)=>{
 const historicalIDs=new Map();
 for(let i=0;i<3;i++){
  historicalIDs.set(String(401720101+i),{team:'BOS',i});
  historicalIDs.set(String(401720201+i),{team:'MIA',i});
 }
 return async url=>{
  calls.push(String(url));
  const matchTeam=url.match(/teams\/(2|16)\//),team=matchTeam?.[1]==='2'?'BOS':'MIA';
  if(url.endsWith('/roster')){
   return {athletes:Array.from({length:8},(_,i)=>({
    id:String((team==='BOS'?1000:2000)+i),displayName:team+' player '+i,status:{name:'Active'}
   }))};
  }
  if(url.includes('/schedule?')){
   if(url.includes('season=2027'))return{events:[]};
   if(url.includes('season=2026&seasontype=2'))return{events:Array.from({length:3},(_,i)=>({
    id:String((team==='BOS'?401720101:401720201)+i),
    date:'2026-04-'+String(10+i).padStart(2,'0')+'T20:00:00Z',
    status:{type:{state:'post'}}
   }))};
   throw Error('wrong season query');
  }
  if(url.includes('/summary?event=')){
   const id=url.split('=').pop(),details=historicalIDs.get(id);
   if(!details)throw Error('wrong event ID');
   return{
    header:{competitions:[{id,status:{type:{state:'post'}},competitors:[
     {homeAway:'home',team:{abbreviation:'BOS'}},
     {homeAway:'away',team:{abbreviation:'MIA'}}]}]},
    boxscore:{players:[{team:{abbreviation:details.team},statistics:[{
     names:['PTS','REB','AST','3PT'],
     athletes:Array.from({length:8},(_,i)=>({
      athlete:{id:String((details.team==='BOS'?1000:2000)+i),displayName:details.team+' player '+i},
      stats:[String(12+i*2+details.i),String(3+i+details.i),String(2+i+details.i),String((i%3)+details.i)]
     }))
    }]}]}
   };
  }
  throw Error('unexpected fetch: '+url);
 };
};
test('before October 20, preseason snapshots should not create pretend current regular-season samples',async()=>{
 const calls=[];
 const game=fixture(1,'401908941');
 const output=await nbaPrepareEvidence(game,{fetchJson:dataMock(calls)});
 assert.equal(output.status,'NOT_READY');
 assert.equal(output.samplesUsed,0);
 assert.deepEqual(output.sgps.map(x=>x.status),['NOT_READY','NOT_READY','NOT_READY']);
 assert.match(output.reason,/Preseason sample is insufficient/);
 assert.ok(calls.every(x=>!x.includes('season=2026&seasontype=2')),
  'last season must not be silently treated as preseason');
});
test('October 20 opening-night regular-season model uses labeled 2025-26 game samples, not invented 2026-27 stats',async()=>{
 const calls=[];
 const output=await nbaPrepareEvidence(fixture(2),{fetchJson:dataMock(calls)});
 assert.equal(output.sampleSource,'PRIOR_SEASON');
 assert.equal(output.historicalSeason,2026);
 assert.equal(output.status,'MODEL_ONLY');
 assert.ok(output.samplesUsed>=4);
 assert.ok(output.playerProjections.length>=8);
 assert.ok(calls.filter(x=>x.includes('season=2026&seasontype=2')).length===2);
 assert.ok(output.playerProjections.every(x=>x.sampleSource==='PRIOR_SEASON'&&x.historicalSeason===2026));
 assert.ok(output.playerProjections.every(x=>x.basis.includes('Previous-season')));
 assert.ok(output.playerProjections.every(x=>x.name!=='BOS player 0'),
  'questionable day-to-day player may not become a confirmed eligible starter');
 for(const risk of ['Small','Medium','Nuke']){
  const s=output.sgps.find(x=>x.risk===risk);
  assert.equal(s.status,'MODEL_CANDIDATE',risk);
  assert.equal(s.confidence,'PRIOR_SEASON_BASELINE');
  assert.ok(s.legs.every(l=>l.sampleSource==='PRIOR_SEASON'));
  assert.equal(s.combinedBookOdds,null);
  assert.equal(s.combinedBookOddsVerified,false);
  assert.equal(s.publishable,false);
 }
});
test('prior-season stats cannot use a traded player from a different current team without verifying game-team identity',()=>{
 const roster=nbaRosterEvidence([{team:'BOS',data:{athletes:[{id:'101',displayName:'Traded Star',status:{name:'Active'}}]}}],
  'BOS','MIA');
 const result=nbaBuildPregameModels({gameId:'401911111',home:'BOS',away:'MIA',
  tipoff:'2026-10-20T23:00:00Z',roster,sampleSource:'PRIOR_SEASON',historicalSeason:2026,
  historical:[{gameId:'401720101',status:'FINAL',players:[{playerId:'101',team:'MIA',points:40,rebounds:7,assists:8,threes:5,pra:55}]},
   {gameId:'401720102',status:'FINAL',players:[{playerId:'101',team:'MIA',points:40,rebounds:7,assists:8,threes:5,pra:55}]}]});
 assert.equal(result.playerProjections.length,0);
 assert.ok(result.sgps.every(x=>x.status==='NOT_READY'));
});
test('NBA collector schedules recalculate cached pregame snapshots under new historical season model',()=>{
 assert.ok(NBA_PREGAME_MODEL_VERSION.startsWith('v7-'));
 const game=fixture(2);
 const now=Date.parse(game.kickoff)-24*3600000;
 const previous={modelVersion:'v2-season-aware-freshness',stage:'DAY_AHEAD_BUILD',
  checkedAt:new Date(now).toISOString()};
 const readiness=nbaPregameStage({...game,status:'SCHEDULED'},previous,{now:now+2*60_000});
 assert.equal(readiness.due,true);
 assert.equal(readiness.reason,'model_version_changed');
});
test('NBA screen explicitly marks previous-season SGP sample as prior-year historical baseline',()=>{
 const js=readFileSync(new URL('../public-nba.js',import.meta.url),'utf8');
 assert.ok(js.includes("readiness?.sampleSource==='PRIOR_SEASON'"));
 assert.ok(js.includes('NOT current-season results'));
 const backend=readFileSync(new URL('../api/nba-health.js',import.meta.url),'utf8');
 assert.ok(backend.includes('historicalSeason:snapshot.historicalSeason'));
});
