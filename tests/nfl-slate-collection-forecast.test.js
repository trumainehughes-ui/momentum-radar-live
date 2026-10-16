import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflCollectionForecast} from '../lib/nfl-slate-collection-forecast.js';

const now=Date.parse('2026-10-16T20:51:00Z');
const ids=['401872996','401872999','401872997','401873003',
 '401873001','401873000','401872998','401873002',
 '401873004','401873006','401873005','401873007'];
const kickoffs=['2026-10-18T13:30:00Z',
 ...Array(7).fill('2026-10-18T17:00:00Z'),
 '2026-10-18T20:05:00Z',
 ...Array(2).fill('2026-10-18T20:25:00Z'),
 '2026-10-19T00:20:00Z'];
const schedule=ids.map((gameId,i)=>({gameId,kickoff:kickoffs[i],status:'SCHEDULED'}));

test('all twelve Sunday NFL games are planned across both signed collector shards',()=>{
 const report=nflCollectionForecast(schedule,{now});
 assert.equal(report.scheduledGames,12);
 assert.equal(report.dueNow,0);
 assert.equal(report.waiting,12);
 assert.equal(report.shards.length,2);
 assert.deepEqual(report.shards.map(x=>x.scheduled),[6,6]);
 assert.deepEqual(report.shards.map(x=>x.due),[0,0]);
 assert.equal(new Set(report.games.map(x=>x.gameId)).size,12);
 assert.equal(report.games[0].gameId,'401872996');
 assert.equal(report.games[0].windowOpensAt,'2026-10-17T07:30:00.000Z');
 assert.equal(report.games[0].earliestEligibleCronTick,'2026-10-17T07:30:00.000Z');
 assert.equal(report.games[0].checkpointStageNow,null);
});
test('day-ahead and final-window changes are deterministic; do not assert a real collector ran',()=>{
 const first=schedule[0];
 const justEarly=nflCollectionForecast([first],{now:Date.parse('2026-10-17T07:29:59Z')});
 assert.equal(justEarly.dueNow,0);
 assert.equal(justEarly.games[0].collectorState,'AWAITING_30H_WINDOW');
 const due=nflCollectionForecast([first],{now:Date.parse('2026-10-17T07:30:00Z')});
 assert.equal(due.dueNow,1);
 assert.equal(due.games[0].collectorState,'DAY_AHEAD_WINDOW');
 assert.equal(due.games[0].checkpointStageNow,'DAY_AHEAD');
 const final=nflCollectionForecast([first],{now:Date.parse('2026-10-18T13:00:00Z')});
 assert.equal(final.finalWindow,1);
 assert.equal(final.games[0].checkpointStageNow,'FINAL_T_MINUS_30');
 const gone=nflCollectionForecast([first],{now:Date.parse('2026-10-18T13:30:00Z')});
 assert.equal(gone.dueNow,0);
 assert.equal(gone.games[0].collectorState,'KICKOFF_PASSED');
});
test('shared UTC-day paid checkpoint budget forecast includes Sunday night UTC rollover',()=>{
 const report=nflCollectionForecast(schedule,{now});
 assert.deepEqual(report.utcBudgetForecast.map(x=>[x.utcDate,x.dayAhead,x.final,x.total]),[
  ['2026-10-17',12,0,12],
  ['2026-10-18',0,11,11],
  ['2026-10-19',0,1,1]
 ]);
 assert.ok(report.utcBudgetForecast.every(x=>x.exceedsSharedCapacity===false));
 assert.match(report.note,/not a guarantee/);
});
test('invalid, duplicate and non-scheduled matches cannot inflate forecast or trigger provider calls',()=>{
 const extra=[schedule[0],{...schedule[0]},
  {gameId:'bad',kickoff:kickoffs[1],status:'SCHEDULED'},
  {gameId:'401873099',kickoff:'invalid',status:'SCHEDULED'},
  {gameId:'401873098',kickoff:kickoffs[1],status:'FINAL'}];
 const report=nflCollectionForecast(extra,{now});
 assert.equal(report.scheduledGames,1);
 assert.equal(report.games[0].gameId,'401872996');
 assert.equal(report.games[0].shard,0);
});
test('public health endpoint uses the same fixed 30-hour collector forecast without invoking paid odds',()=>{
 const src=readFileSync(new URL('../api/nfl-health.js',import.meta.url),'utf8');
 const planner=readFileSync(new URL('../lib/nfl-slate-collection-forecast.js',import.meta.url),'utf8');
 assert.ok(src.includes('const collectionForecast=nflCollectionForecast(games);'));
 assert.ok(src.includes('   collectionForecast,'));
 assert.ok(planner.includes('nflCollectorDueGames(games,{now})'));
 assert.ok(!planner.includes('fetch('));
 assert.ok(!planner.includes('put('));
});
