import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('NFL fallback and publication injury checks use real regex word boundaries',()=>{
 const source=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const correct=String.raw`/\b(OUT|INACTIVE|IR|DOUBTFUL|QUESTIONABLE|SUSPENDED)\b/i`;
 const incorrect=String.raw`/\\b(OUT|INACTIVE|IR|DOUBTFUL|QUESTIONABLE|SUSPENDED)\\b/i`;
 assert.equal(source.split(correct).length-1,2);
 assert.ok(!source.includes(incorrect));
 const injury=new RegExp('\\b(OUT|INACTIVE|IR|DOUBTFUL|QUESTIONABLE|SUSPENDED)\\b','i');
 for(const status of ['OUT','INACTIVE','IR','DOUBTFUL','QUESTIONABLE','SUSPENDED'])
  assert.equal(injury.test('status: '+status),true,status);
 assert.equal(injury.test('ACTIVE'),false);
});
