import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePlayerGameLogs} from '../lib/player-game-log-analysis.js';
test('reports last-five and last-ten hit rates using real supplied games',()=>{
 const games=Array.from({length:10},(_,i)=>({gameId:String(i),date:'2026-09-'+String(30-i).padStart(2,'0'),value:i<6?80:40,opponent:'DEN'}));
 const a=analyzePlayerGameLogs({sport:'NFL',playerId:'1',market:'rushing',line:75,games,source:'league_box_scores'});
 assert.equal(a.last5.hitRate,100);
 assert.equal(a.last10.hitRate,60);
 assert.equal(a.last10.average,64);
});
test('rejects duplicate, unidentified, and missing-value game logs',()=>{
 const a=analyzePlayerGameLogs({sport:'NBA',playerId:'2',market:'points',line:20,games:[{gameId:'a',date:'2026-10-01',value:25},{gameId:'a',date:'2026-10-01',value:100},{gameId:'b',date:'2026-10-02',value:''},{date:'2026-10-03',value:22}]});
 assert.equal(a.verifiedGameCount,1);
 assert.equal(a.last5.hitRate,100);
});
