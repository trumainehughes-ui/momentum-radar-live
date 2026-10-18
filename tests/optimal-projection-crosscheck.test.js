import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeOptimalReference,optimalCrosscheck}
 from '../lib/optimal-projection-crosscheck.js';
import {makeOptimalProjectionReferenceHandler}
 from '../api/optimal-projection-reference.js';
const now=Date.parse('2026-10-18T12:50:00Z');
const fixture={
 league:'nfl',date:'2026-10-18',gameId:'401872996',home:'JAX',away:'HOU',
 optimalEventId:'fe159f33-6f6e-4a11-ba32-0be62842bfb9',
 observedAt:new Date(now-60000).toISOString(),source:'Optimal Sports Projections',
 players:[{name:'Parker Washington',team:'JAX',
  optimalPlayerId:'e900231a-014b-433f-9fa2-9f69b9348c69',
  injury_status:'None',projections:[
   {propType:'receivingYards',p25:37.9,p50:64.76,p75:98.77,p90:135.49},
   {propType:'receptions',p25:2.88,p50:4.74,p75:6.61,p90:8.28},
   {propType:'receivingTouchdowns',p25:0,p50:0,p75:1,p90:1}
  ],bookOdds:'+5000',bookOffer:{book:'DraftKings',line:155,odds:-105}},
  {name:'Brenton Strange',team:'JAX',
  optimalPlayerId:'6df75b9c-becf-4a8e-bf48-04ac0e823de6',
  projections:[{propType:'receivingYards',p25:20.54,p50:38.19,p75:61.28,p90:86.7}]}
 ]};
const model={league:'nfl',date:fixture.date,gameId:fixture.gameId,sgps:{Analytics:[
 {risk:'Small',legs:[{name:'Parker Washington',team:'JAX',cat:'receiving',projection:70},
  {name:'Brenton Strange',team:'JAX',cat:'receiving',projection:39}]},
 {risk:'Medium',legs:[{name:'Parker Washington',team:'JAX',cat:'receptions',projection:5}]},
 {risk:'Nuke',legs:[{name:'Parker Washington',team:'JAX',cat:'td'}]}]}};

test('strict Optimal normalization accepts live percentiles, excludes sportsbook fields',()=>{
 const ref=normalizeOptimalReference(fixture,{now});
 assert.equal(ref.ok,true);
 assert.equal(ref.players.length,4);
 assert.equal(ref.players[0].p50,64.76);
 assert.equal(ref.players[0].p75,98.77);
 assert.equal(ref.bookmakerLineVerified,false);
 assert.equal(ref.combinedBookQuoteVerified,false);
 assert.equal(ref.injuryClearanceVerified,false);
 assert.doesNotMatch(JSON.stringify(ref),/bookOdds|bookOffer|injury_status|sportsbook.draftkings/);
});
test('all Small Medium and Nuke AI tiers cross-check without replacing sportsbook selection',()=>{
 const ref=normalizeOptimalReference(fixture,{now});
 const out=optimalCrosscheck(model,ref,{now});
 assert.equal(out.status,'ADVISORY_OPTIMAL_CROSSCHECK');
 assert.deepEqual(out.tiers.map(t=>t.matchedReferenceLegs),[2,1,1]);
 assert.equal(out.tiers[0].matches[0].medianDelta,-5.24);
 assert.equal(out.affectsEligibility,false);
 assert.equal(out.affectsBookOdds,false);
 assert.equal(out.bookmakerSgpQuoteVerified,false);
});
test('public research and NBA market schema are supported without pretending prices exist',()=>{
 const ref=normalizeOptimalReference(fixture,{now});
 const pub={league:'nfl',date:fixture.date,gameId:fixture.gameId,modelResearchTiers:[
  {risk:'Small',legs:[{player:'Parker Washington',team:'JAX',category:'receiving',projection:70}]}]};
 assert.equal(optimalCrosscheck(pub,ref,{now}).tiers[0].matchedReferenceLegs,1);
 const nba={league:'nba',date:'2026-10-20',gameId:'401810002',
  home:'DET',away:'BOS',optimalEventId:'64a104f6-5850-4045-bc84-bb82bff9a70e',
  observedAt:new Date(now).toISOString(),players:[{name:'A Basketball Player',team:'DET',
   optimalPlayerId:'e900231a-014b-433f-9fa2-9f69b9348c69',
   projections:[{propType:'points',p25:12,p50:19,p75:26,p90:33},
    {propType:'rebounds',p25:4,p50:6,p75:9,p90:12}]}]};
 assert.equal(normalizeOptimalReference(nba,{now}).players.length,2);
});
test('reject foreign games, old scores, invalid percentile ordering, and unrelated teams',()=>{
 const ref=normalizeOptimalReference(fixture,{now});
 assert.equal(optimalCrosscheck({...model,gameId:'401872997'},ref,{now}).status,'NO_CURRENT_OPTIMAL_REFERENCE');
 assert.equal(optimalCrosscheck({...model,date:'2026-10-19'},ref,{now}).status,'NO_CURRENT_OPTIMAL_REFERENCE');
 assert.equal(optimalCrosscheck(model,ref,{now:now+2*3600_000}).status,'NO_CURRENT_OPTIMAL_REFERENCE');
 assert.equal(normalizeOptimalReference({...fixture,observedAt:new Date(now-2*3600_000).toISOString()},{now}).ok,false);
 const bad={...fixture,players:[{...fixture.players[0],team:'BUF',
  projections:[{propType:'receivingYards',p25:80,p50:60,p75:50,p90:90}]}]};
 assert.equal(normalizeOptimalReference(bad,{now}).players.length,0);
});
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},
 status(n){this.statusCode=n;return this},json(obj){this.body=obj;return this}}}
test('public GET is read-only and default has no synced data or invented projections',async()=>{
 const route=makeOptimalProjectionReferenceHandler({
  now:()=>now,blobList:async()=>({blobs:[]}),
  blobPut:async()=>{throw Error('must not write')},
  fetcher:async()=>{throw Error('must not fetch')},env:{}});
 const res=response();
 await route({method:'GET',query:{league:'nfl',date:fixture.date,gameId:fixture.gameId}},res);
 assert.equal(res.statusCode,200);
 assert.equal(res.body.status,'NO_CURRENT_OPTIMAL_REFERENCE');
 assert.equal(res.body.bookmakerSgpQuoteVerified,false);
});
test('POST needs independent 32-character authorized publishing secret',async()=>{
 let writes=0;
 const env={MOMENTUM_OPTIMAL_IMPORT_KEY:'x'.repeat(40)};
 const handler=makeOptimalProjectionReferenceHandler({now:()=>now,env,
  blobList:async()=>({blobs:[]}),
  blobPut:async()=>{writes++}});
 for(const auth of ['', 'Bearer wrong']){
  const res=response();
  await handler({method:'POST',body:fixture,headers:{authorization:auth}},res);
  assert.equal(res.statusCode,401);
 }
 assert.equal(writes,0);
 const res=response();
 await handler({method:'POST',body:fixture,headers:{
  authorization:'Bearer '+env.MOMENTUM_OPTIMAL_IMPORT_KEY}},res);
 assert.equal(res.statusCode,201);
 assert.equal(res.body.status,'ADVISORY_REFERENCE_PUBLISHED');
 assert.equal(res.body.bookmakerSgpQuoteVerified,false);
 assert.equal(writes,1);
});
test('AI is still embedded, but Optimal does not override Groq or bookmaker gates',()=>{
 const main=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const pub=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 const endpoint=readFileSync(new URL('../api/nfl-ai-triage.js',import.meta.url),'utf8');
 const browse=readFileSync(new URL('../optimal-sgp-crosscheck-bootstrap.js',import.meta.url),'utf8');
 assert.match(main,/momentumAiGameChanged/);
 assert.match(pub,/AI Game Analyzer/);
 assert.match(pub,/showAi\(d\)/);
 assert.match(endpoint,/api.groq.com\/openai\/v1\/chat\/completions/);
 assert.match(main,/optimal-sgp-crosscheck-bootstrap.js/);
 assert.match(pub,/optimal-sgp-crosscheck-bootstrap.js/);
 assert.match(browse,/No substitute betting lines are generated/);
});
