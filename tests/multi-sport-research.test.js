import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/multi-sport-research.js';
function response(){return {code:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};}
test('rejects unsupported leagues without upstream calls',async()=>{
 const res=response();await handler({method:'GET',query:{league:'WNBA'}},res);
 assert.equal(res.code,400);assert.equal(res.body.error,'LEAGUE_NOT_ENABLED');
});
test('rejects malformed date',async()=>{
 const res=response();await handler({method:'GET',query:{league:'NFL',date:'bad-date'}},res);
 assert.equal(res.code,400);assert.equal(res.body.error,'INVALID_DATE');
});
test('allows only GET',async()=>{
 const res=response();await handler({method:'POST',query:{league:'NBA'}},res);
 assert.equal(res.code,405);assert.equal(res.headers.Allow,'GET');
});

test('rejects invalid game identifiers',async()=>{
 const res=response();await handler({method:'GET',query:{league:'NBA',gameId:'not-a-game'}},res);
 assert.equal(res.code,400);assert.equal(res.body.error,'INVALID_GAME_ID');
});
