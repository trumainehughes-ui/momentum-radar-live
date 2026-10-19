import test from 'node:test';
import assert from 'node:assert/strict';
import {nbaVerifiedPositionSamples} from '../lib/nba-position-collector.js';
const roster=new Map([['1',{position:'PG'}],['2',{position:'C'}]]);
const game=(id,date)=>({gameId:id,status:'FINAL',date,
 matchup:{home:{abbr:'BOS'},away:{abbr:'NYK'}},
 players:[{playerId:'1',team:'NYK',points:20,rebounds:3,assists:8,threes:2},
 {playerId:'2',team:'NYK',points:12,rebounds:11,assists:1,threes:0}]});
test('aggregate position allowances from unique completed games',()=>{
 const out=nbaVerifiedPositionSamples({historical:[game('1','2026-10-17T00:00:00Z'),
 game('2','2026-10-18T00:00:00Z'),game('2','2026-10-18T00:00:00Z')],
 roster,asOf:'2026-10-19T00:00:00Z',minGames:2});
 assert.equal(out.teams.BOS.allowedByPosition.PG.games,2);
 assert.equal(out.teams.BOS.allowedByPosition.PG.assists,8);
 assert.equal(out.teams.BOS.allowedByPosition.PG.sampleStatus,'OBSERVED');
});
test('future games and missing position labels are excluded',()=>{
 const out=nbaVerifiedPositionSamples({historical:[game('1','2026-10-21T00:00:00Z')],
 roster,asOf:'2026-10-19T00:00:00Z'});
 assert.equal(out.status,'NOT_READY');
});
