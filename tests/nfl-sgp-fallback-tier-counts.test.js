import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NFL_SGP_TIERS} from '../lib/ai-mechanics/nfl-sgp-tiers.js';

test('NFL research fallback sizes respect every tier range',()=>{
 const source=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const marker=source.match(/for\(const \[risk,count\] of (\[\[[^\n]+\])\)\{/);
 assert.ok(marker,'fallback tier sizes must be declared');
 const pairs=[...marker[1].matchAll(/\['(Small|Medium|Large|Nuke)',(\d+)\]/g)];
 assert.equal(pairs.length,4);
 for(const [,risk,n] of pairs){
  const count=Number(n),tier=NFL_SGP_TIERS[risk];
  assert.ok(count>=tier.minLegs&&count<=tier.maxLegs,risk+' fallback count '+count+' outside tier limits');
 }
});
