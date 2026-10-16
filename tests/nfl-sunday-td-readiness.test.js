import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflSundayTdReadiness} from '../lib/nfl-sunday-td-readiness.js';
import {buildNflSlateRankings} from '../lib/nfl-slate-rankings.js';

const date='2026-10-18';
const ids=['401872996','401872999','401872997','401873003',
 '401873001','401873000','401872998','401873002',
 '401873004','401873006','401873005','401873007'];
const kickoffs=['2026-10-18T13:30:00Z',...Array(7).fill('2026-10-18T17:00:00Z'),
 '2026-10-18T20:05:00Z',...Array(2).fill('2026-10-18T20:25:00Z'),
 '2026-10-19T00:20:00Z'];
const games=ids.map((gameId,i)=>({
 gameId,kickoff:kickoffs[i],status:'SCHEDULED',
 home:{abbr:'HOME'},away:{abbr:'AWAY'}
}));
const snapshotAt='2026-10-16T22:00:00Z';
const ranked=(arr=ids.map(gameId=>({gameId,at:snapshotAt})))=>({
 date,categories:{td:Array.from({length:10},(_,i)=>({name:'Scorer '+i}))},
 tdGameSnapshots:arr,verifiedTdOffers:0
});

test('all 12 Sunday matchups and UTC-Monday Sunday-night game are counted as model prepared',()=>{
 const now=Date.parse('2026-10-16T22:50:00Z');
 const out=nflSundayTdReadiness({date,games,rankings:ranked(),now});
 assert.equal(out.scheduledGames,12);
 assert.equal(out.modelGames,12);
 assert.equal(out.missingGames,0);
 assert.equal(out.stalePregameGames,0);
 assert.equal(out.topScorers,10);
 assert.equal(out.status,'FULL_SUNDAY_MODEL_COVERAGE');
 assert.deepEqual(out.missingGameIds,[]);
 assert.ok(out.games.some(g=>g.gameId==='401873007'&&g.phase==='EARLY_PREVIEW'));
});
test('missing per-game provenance schema cannot be mistaken for all twelve games missing',()=>{
 const now=Date.parse('2026-10-16T22:50:00Z');
 assert.throws(()=>nflSundayTdReadiness({date,games,rankings:{
  date,categories:{td:Array.from({length:10},()=>({}))},
  categoryGameCounts:{td:12}
 },now}),/per_game_model_snapshot_provenance_unavailable/);
});
test('a missing matchup is explicitly named even if a top-ten card still shows ten names',()=>{
 const now=Date.parse('2026-10-16T22:50:00Z');
 const out=nflSundayTdReadiness({date,games,rankings:ranked(
  ids.slice(0,-1).map(gameId=>({gameId,at:snapshotAt}))),now});
 assert.equal(out.status,'INCOMPLETE_SUNDAY_MODELS');
 assert.equal(out.modelGames,11);
 assert.deepEqual(out.missingGameIds,['401873007']);
 assert.equal(out.topScorers,10);
});
test('saved model older than 30 minutes after the T-minus-30-hour window is flagged stale',()=>{
 const now=Date.parse('2026-10-17T08:10:00Z');
 const full=ranked(ids.map((gameId,i)=>({gameId,
  at:i===0?snapshotAt:new Date(now-5*60000).toISOString()})));
 const out=nflSundayTdReadiness({date,games,rankings:full,now});
 assert.equal(out.status,'PREGAME_MODEL_REFRESH_OVERDUE');
 assert.deepEqual(out.staleGameIds,['401872996']);
 assert.equal(out.games.find(x=>x.gameId==='401872996').phase,'PREGAME_WINDOW');
 assert.equal(out.missingGames,0);
});
test('strict Sunday local calendar excludes UTC Monday daytime and duplicated/outdated schedule items',()=>{
 const now=Date.parse('2026-10-16T22:50:00Z');
 const extra=[...games,{...games[0]},
  {gameId:'401879999',kickoff:'2026-10-19T17:00:00Z',status:'SCHEDULED'},
  {gameId:'401879998',kickoff:'2026-10-18T18:00:00Z',status:'FINAL'},
  {gameId:'invalid',kickoff:'2026-10-18T18:00:00Z',status:'SCHEDULED'}];
 assert.equal(nflSundayTdReadiness({date,games:extra,rankings:ranked(),now}).scheduledGames,12);
});
test('ranking builder includes per-game snapshot age even if only ten players appear',()=>{
 const now=Date.parse('2026-10-16T23:00:00Z');
 const snap={
  at:now-60_000,
  body:{ok:true,date,gameId:ids[0],home:'BUF',away:'MIA',
   validation:{injuryEligibilityChecked:true},
   categories:{td:[{eventID:ids[0],playerID:'1234567',name:'Sample RB',team:'BUF',
    position:'RB',projection:'Anytime TD',tdModelStatus:'ESPN_MATCHUP_MODEL',
    modelOnly:true,modelTdPercent:57,evidence:{games:5,opportunitiesPerGame:10}}]}}
 };
 const out=buildNflSlateRankings([snap],{date,now});
 assert.equal(out.tdGameSnapshots.length,1);
 assert.deepEqual(out.tdGameSnapshots[0],{
  gameId:ids[0],at:new Date(now-60_000).toISOString()});
});
test('readiness API uses existing free schedule and saved ranking data, never paid provider paths',()=>{
 const code=readFileSync(new URL('../api/nfl-td-readiness.js',import.meta.url),'utf8');
 assert.ok(code.includes("fetchJson('/api/nfl-schedule'+query)"));
 assert.ok(code.includes("fetchJson('/api/nfl-slate-rankings'+query)"));
 assert.ok(code.includes("nflSundayTdReadiness({date,games:schedule.games,rankings,now})"));
 for(const disallowed of ['prop-line-markets','nfl-markets?','THE_ODDS_API_KEY','SPORTSGAMEODDS_API_KEY','GROQ_API_KEY'])
  assert.equal(code.includes(disallowed),false,disallowed);
});
