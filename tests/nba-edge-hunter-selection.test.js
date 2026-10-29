import test from 'node:test';
import assert from 'node:assert/strict';
import {selectNbaEdgeHunter} from '../lib/nba-edge-hunter.js';
const player=(id,category,team,over=8)=>({playerId:id,name:id,team,category,
 prediction:26,line:20,last10:Array.from({length:10},(_,i)=>i<over?24:15),
 starterVerified:true,marketVerified:true});
const game=(id,total,spread)=>({gameId:id,total,spread,players:[
 player(id+'a','points','A'),player(id+'b','rebounds','B')]});
test('Edge Hunter chooses two highest qualifying totals and exactly four distinct legs',()=>{
 const result=selectNbaEdgeHunter([game('low',220,2),game('top',245,3),game('wide',260,8),game('second',240,5)]);
 assert.equal(result.status,'MODEL_RESEARCH');
 assert.deepEqual(result.games,['top','second']);
 assert.equal(result.legs.length,4);
 assert.ok(result.legs.every(x=>x.hitRate===.8&&Math.abs(x.edge-.3)<1e-9));
 assert.equal(result.publishable,false);
 assert.equal(result.combinedBookOdds,null);
});
test('Edge Hunter fails closed for missing verified markets, starters, or last-ten hits',()=>{
 const a=game('a',250,2),b=game('b',240,2);
 a.players[0].marketVerified=false;
 assert.equal(selectNbaEdgeHunter([a,b]).status,'NOT_READY');
 a.players[0].marketVerified=true;a.players[0].last10=[24,24,24,24,24,24,15,15,15,15];
 assert.equal(selectNbaEdgeHunter([a,b]).legs.length,0);
 a.players[0].last10=Array(10).fill(24);a.players[0].starterVerified=false;
 assert.equal(selectNbaEdgeHunter([a,b]).status,'NOT_READY');
});
test('Edge Hunter rejects six-point spreads and same-player duplicate markets',()=>{
 const a=game('a',250,6),b=game('b',245,1);
 assert.equal(selectNbaEdgeHunter([a,b]).status,'NOT_READY');
 a.spread=5;a.players[1].playerId=a.players[0].playerId;
 assert.equal(selectNbaEdgeHunter([a,b]).status,'NOT_READY');
});
