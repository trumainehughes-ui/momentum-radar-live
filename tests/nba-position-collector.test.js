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

test('position sample remains thin until five distinct completed games',()=>{
 const historical=Array.from({length:5},(_,i)=>game(String(i+1),
  '2026-10-'+String(10+i).padStart(2,'0')+'T00:00:00Z'));
 const four=nbaVerifiedPositionSamples({historical:historical.slice(0,4),roster,
  asOf:'2026-10-19T00:00:00Z'});
 const five=nbaVerifiedPositionSamples({historical,roster,
  asOf:'2026-10-19T00:00:00Z'});
 assert.equal(four.teams.BOS.allowedByPosition.PG.sampleStatus,'THIN_SAMPLE');
 assert.equal(five.teams.BOS.allowedByPosition.PG.sampleStatus,'OBSERVED');
 assert.equal(five.teams.BOS.allowedByPosition.C.rebounds,11);
});
test('box-score position is accepted when roster position is absent',()=>{
 const noPositions=new Map([['1',{}],['2',{}]]);
 const g=game('1','2026-10-15T00:00:00Z');
 g.players[0].position='PG';g.players[1].position='C';
 const x=nbaVerifiedPositionSamples({historical:[g],roster:noPositions,
  asOf:'2026-10-19T00:00:00Z'});
 assert.equal(x.teams.BOS.allowedByPosition.PG.assists,8);
});

test('duplicate player rows do not inflate opponent position allowances',()=>{
 const g=game('9','2026-10-17T00:00:00Z');
 g.players.push({...g.players[0]});
 const out=nbaVerifiedPositionSamples({historical:[g],roster,
  asOf:'2026-10-19T00:00:00Z'});
 assert.equal(out.teams.BOS.allowedByPosition.PG.points,20);
 assert.equal(out.teams.BOS.allowedByPosition.PG.assists,8);
});
test('invalid duplicate game identity cannot suppress a valid box score',()=>{
 const invalid={...game('9','2026-10-16T00:00:00Z'),matchup:{home:{abbr:'BOS'},away:{abbr:'BOS'}}};
 const out=nbaVerifiedPositionSamples({historical:[invalid,game('9','2026-10-17T00:00:00Z')],
  roster,asOf:'2026-10-19T00:00:00Z'});
 assert.equal(out.teams.BOS.allowedByPosition.PG.points,20);
});
