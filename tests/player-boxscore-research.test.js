import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/player-boxscore-research.js';
const res=()=>({code:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
test('rejects missing game id',async()=>{const r=res();await handler({method:'GET',query:{league:'NBA'}},r);assert.equal(r.code,400);});
test('rejects unsupported league',async()=>{const r=res();await handler({method:'GET',query:{league:'WNBA',gameId:'123456789'}},r);assert.equal(r.code,400);});
test('normalizes player stat rows without sportsbook claims',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({boxscore:{players:[{
  team:{id:'1',displayName:'Example Team'},statistics:[{name:'passing',
  labels:['YDS'],athletes:[{athlete:{id:'10',displayName:'Example Player'},stats:['200']}]}]
 }]}})});
 try{const r=res();await handler({method:'GET',query:{league:'NFL',gameId:'123456789'}},r);
 assert.equal(r.code,200);assert.equal(r.body.records[0].playerName,'Example Player');
 assert.equal(r.body.records[0].stats[0],'200');assert.equal(r.body.sportsbookVerified,false);}
 finally{globalThis.fetch=original;}
});
