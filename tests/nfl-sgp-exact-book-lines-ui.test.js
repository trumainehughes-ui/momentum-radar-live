import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const pub=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
const admin=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('public SGP never falls back to model-generated betting slips',()=>{
 assert.match(pub,/const candidateModels=Array\.isArray\(d\.researchParlays\)\?d\.researchParlays:\[\]/);
 assert.match(pub,/c\.legs\.every\(l=>\{/);
 assert.match(pub,/offer\.attested!==true/);
 assert.match(pub,/Number\(offer\.line\)!==target/);
 assert.match(pub,/c\.combinedOddsVerified!==true/);
 assert.match(pub,/c\.mode!=='VERIFIED_BOOK_SGP'/);
 assert.match(pub,/!nflPublicTierMarketMixReady\(c\.risk,c\.legs\)/);
});
test('production SGP does not print unverified model thresholds as picks',()=>{
 assert.match(admin,/Projection-only thresholds are intentionally hidden/);
 assert.doesNotMatch(admin,/nflModelLine\(x,x\.cat\)\+'<span class="meta">'\+nflLegHitChance/);
});
test('both dashboards have valid inline JavaScript',()=>{
 for(const html of [pub,admin]){
  for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
   if(m[1].trim())assert.doesNotThrow(()=>new Script(m[1]));
  }
 }
});
