import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {gradeHistory,parlayStatus,selectedTouchdown} from '../lib/nfl-results.js';
const pick={playerId:'1',name:'Test Player',category:'td'};
const snap={game:{kickoff:'2026-10-04T17:00:00Z'},lockedAt:'2026-10-04T16:30:00Z',picks:[pick],sgps:[]};
test('stars require matching pregame player identity, including SGP TD legs',()=>{
 assert.equal(selectedTouchdown(snap,{playerId:'1'}),true);
 assert.equal(selectedTouchdown(snap,{playerId:'2',name:'Test Player'}),false);
 assert.equal(selectedTouchdown({...snap,picks:[],sgps:[{legs:[pick]}]},{playerId:'1'}),true);
 assert.equal(selectedTouchdown({...snap,lockedAt:snap.game.kickoff},{playerId:'1'}),false);
 assert.equal(selectedTouchdown({...snap,picks:[{...pick,category:'passing'}]},{playerId:'1'}),false);
});
test('Anytime TD grades zero as miss and rushing/receiving TD as hit',()=>{
 for(const n of [0,1,2])assert.equal(gradeHistory({...pick,threshold:0},new Map([['1',{rushTD:n,recTD:0}]])).status,n?'HIT':'MISS');
 assert.equal(gradeHistory(pick,new Map()).status,'UNGRADABLE');
 assert.equal(gradeHistory(pick,new Map([['1',{passing:250}]])).status,'MISS');
});
test('model inclusive thresholds and parlay unknown results',()=>{
 assert.equal(gradeHistory({...pick,category:'rushing',threshold:60,thresholdType:'AT_LEAST'},new Map([['1',{rushing:60}]])).status,'HIT');
 assert.equal(parlayStatus([{grade:{status:'HIT'}},{grade:{status:'UNGRADABLE'}}]),'UNGRADABLE');
 assert.equal(parlayStatus([{grade:{status:'HIT'}},{grade:{status:'MISS'}}]),'MISS');
 assert.equal(parlayStatus([{grade:{status:'HIT'}}]),'HIT');
});
test('history renders selected player, actual result, stars and all SGP leg outcomes',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const code=html.slice(html.indexOf('function nflEscape('),html.indexOf('async function loadNFLHistory('));
 const ctx=vm.createContext({});vm.runInContext(code,ctx);
 const p={...pick,grade:{status:'HIT',target:1,actual:2}};
 const out=ctx.nflHistoryCard({picks:[p],sgps:[{book:'DraftKings',risk:'Small',status:'HIT',hit:true,legsHit:1,legsTotal:1,legs:[p]}]});
 assert.match(out,/⭐ Test Player<\\/b>.*Anytime touchdown/s);assert.match(out,/Actual: 2/);assert.match(out,/⭐ DraftKings Small SGP — HIT/);
 assert.doesNotMatch(ctx.nflResultRow({...p,grade:{status:'MISS',actual:0}}),/⭐/);
 assert.doesNotMatch(ctx.nflResultRow({...p,name:'<script>'}),/<script>/);
});
