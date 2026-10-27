import test from 'node:test';
import assert from 'node:assert/strict';
import {rollingPlayerAverages} from '../lib/player-rolling-averages.js';
test('averages completed games and deduplicates by player game',()=>{
 const rows=[
 {playerId:'1',gameId:'100',gameDate:'2026-01-01',gameStatus:'STATUS_FINAL',category:'passing',numericStats:{YDS:200}},
 {playerId:'1',gameId:'101',gameDate:'2026-01-02',gameStatus:'STATUS_FINAL',category:'passing',numericStats:{YDS:300}},
 {playerId:'1',gameId:'101',gameDate:'2026-01-02',gameStatus:'STATUS_FINAL',category:'passing',numericStats:{YDS:300}},
 {playerId:'1',gameId:'102',gameDate:'2026-01-03',gameStatus:'STATUS_IN_PROGRESS',category:'passing',numericStats:{YDS:500}}
 ];
 const result=rollingPlayerAverages(rows)[0];
 assert.equal(result.games,2);assert.equal(result.averages.YDS,250);
});
test('respects last-games window',()=>{
 const rows=[1,2,3].map(i=>({playerId:'5',gameId:String(i),gameDate:'2026-01-0'+i,
 gameStatus:'STATUS_FINAL',numericStats:{PTS:i*10}}));
 assert.equal(rollingPlayerAverages(rows,{lastGames:2})[0].averages.PTS,25);
});
