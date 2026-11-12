import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/plugin-research-matchup.js';
function response(){return {setHeader(){return this},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};}
const secret='preview-test-secret-with-at-least-32-characters';
const matchup={league:'NFL',gameId:'401873006',matchup:{picks:[]}};
const request=(token,body=matchup)=>({method:'POST',headers:{authorization:'Bearer '+token},body});
test('research bridge refuses unauthorized matchup requests',async()=>{
 const prior=process.env.MOMENTUM_RESEARCH_INGEST_KEY;
 process.env.MOMENTUM_RESEARCH_INGEST_KEY=secret;
 try{const res=response();await handler(request('wrong'),res);assert.equal(res.statusCode,401);}
 finally{if(prior===undefined)delete process.env.MOMENTUM_RESEARCH_INGEST_KEY;else process.env.MOMENTUM_RESEARCH_INGEST_KEY=prior;}
});
test('research bridge validates matchup before accessing storage',async()=>{
 const prior=process.env.MOMENTUM_RESEARCH_INGEST_KEY;
 process.env.MOMENTUM_RESEARCH_INGEST_KEY=secret;
 try{const res=response();await handler(request(secret,{...matchup,gameId:'../../private'}),res);assert.equal(res.statusCode,400);}
 finally{if(prior===undefined)delete process.env.MOMENTUM_RESEARCH_INGEST_KEY;else process.env.MOMENTUM_RESEARCH_INGEST_KEY=prior;}
});
test('research bridge fails closed without Blob storage token',async()=>{
 const prior=process.env.MOMENTUM_RESEARCH_INGEST_KEY,blob=process.env.BLOB_READ_WRITE_TOKEN;
 process.env.MOMENTUM_RESEARCH_INGEST_KEY=secret;delete process.env.BLOB_READ_WRITE_TOKEN;
 try{const res=response();await handler(request(secret),res);assert.equal(res.statusCode,503);assert.equal(res.body.error,'research_storage_not_configured');}
 finally{if(prior===undefined)delete process.env.MOMENTUM_RESEARCH_INGEST_KEY;else process.env.MOMENTUM_RESEARCH_INGEST_KEY=prior;
 if(blob===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;else process.env.BLOB_READ_WRITE_TOKEN=blob;}
});

test('research bridge rejects cross-game and cross-league matchup bodies',async()=>{
 const prior=process.env.MOMENTUM_RESEARCH_INGEST_KEY;
 process.env.MOMENTUM_RESEARCH_INGEST_KEY=secret;
 try{
  for(const bad of [{...matchup,matchup:{gameId:'401873999',picks:[]}},
                    {...matchup,matchup:{league:'NBA',picks:[]}}]){
   const res=response();await handler(request(secret,bad),res);assert.equal(res.statusCode,400);
  }
 }finally{if(prior===undefined)delete process.env.MOMENTUM_RESEARCH_INGEST_KEY;else process.env.MOMENTUM_RESEARCH_INGEST_KEY=prior;}
});
