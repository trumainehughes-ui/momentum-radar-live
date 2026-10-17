import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const pub=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
const admin=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('public SGP never falls back to model-generated betting slips',()=>{
 assert.match(pub,/const candidateModels=Array\.isArray\(d\.researchParlays\)\?d\.researchParlays:\[\]/);
 assert.match(pub,/c\.legs\.every\(exactOffer\)/);
 assert.match(pub,/l\?\.sportsbookVerified===true/);
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
