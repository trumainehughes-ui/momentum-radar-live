import test from 'node:test';
import assert from 'node:assert/strict';
import {sealResearch,validateResearch} from '../api/plugin-research-ingest.js';
import {unsealResearch} from '../api/plugin-research-read.js';
import {buildPluginProjectionContext,attachPluginResearchToMatchup} from '../lib/plugin-projection-context.js';
const secret='unit-test-secret-only';
test('production crypto and research adapter complete a safe NFL round trip',()=>{
 const now=Date.now();
 const input={provider:'Optimal Sports Projections',league:'NFL',gameId:'401873006',
  observedAt:new Date(now-60000).toISOString(),observations:[{type:'player_projection',
  subject:'Example Player',description:'Model projects 70 rushing yards; not a book offer',
  sourceReference:'test-provider-lookup'}]};
 const validated=validateResearch(input);
 const sealed=sealResearch(validated,secret);
 assert.equal(JSON.stringify(sealed).includes('Example Player'),false);
 const restored=unsealResearch(JSON.parse(JSON.stringify(sealed)),secret);
 assert.deepEqual(restored,validated);
 const context=buildPluginProjectionContext([restored],{league:'NFL',gameId:input.gameId,now});
 const original={picks:[{player:'Existing Starter',odds:'+120'}],sportsbookVerified:true};
 const result=attachPluginResearchToMatchup(original,context,{league:'NFL',gameId:input.gameId,now});
 assert.equal(result.pluginResearch.notes.length,1);
 assert.equal(result.pluginResearch.eligibleForBetConstruction,false);
 assert.deepEqual(result.picks,original.picks);
 assert.equal(result.sportsbookVerified,true);
 assert.deepEqual(context.bookOffers,[]);
 assert.deepEqual(context.combinedSgpQuotes,[]);
});
test('production crypto rejects ciphertext tampering before analysis',()=>{
 const input=validateResearch({provider:'DraftKings',league:'NBA',gameId:'401873006',
  observedAt:new Date().toISOString(),observations:[{type:'team_stat',subject:'Example Team',
  description:'Example stat',sourceReference:'test-source'}]});
 const sealed=sealResearch(input,secret);
 const ciphertext=Buffer.from(sealed.ciphertext,'base64');
 ciphertext[0]^=1;
 assert.throws(()=>unsealResearch({...sealed,ciphertext:ciphertext.toString('base64')},secret));
});
