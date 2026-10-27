import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/matchup-research.js';
const res=()=>({code:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
test('rejects invalid inputs before any network calls',async()=>{
 for(const query of [{league:'NBA',playerId:'abc',opponentId:'18',stat:'points',dates:'20251225'},
 {league:'NBA',playerId:'3912848',opponentId:'18',stat:'passingYards',dates:'20251225'},
 {league:'NBA',playerId:'3912848',opponentId:'18',stat:'points',dates:''}]){
  const r=res();await handler({method:'GET',query},r);assert.equal(r.code,400);
 }
});
test('returns no fabricated matchup with empty completed slate',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({events:[]})});
 try{const r=res();await handler({method:'GET',query:{league:'NBA',playerId:'3912848',opponentId:'18',stat:'points',dates:'20251225'}},r);
 assert.equal(r.code,200);assert.equal(r.body.comparison.ok,false);
 assert.equal(r.body.sportsbookVerified,false);}
 finally{globalThis.fetch=original;}
});
