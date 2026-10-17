import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
test('public picks inline scripts parse as JavaScript',()=>{
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(Boolean);
 assert.ok(scripts.length>0);
 for(const source of scripts)assert.doesNotThrow(()=>new Script(source));
});
test('live model candidates are fetched asynchronously and allow adaptive tiers',()=>{
 assert.match(html,/async function loadCurrentNflSgpResearch\(/);
 assert.doesNotMatch(html,/async\\s+async\\s+function/);
 assert.match(html,/loadCurrentNflSgpResearch\(state\.date,String\(id\),token\)/);
 assert.doesNotMatch(html,/const expected=c\.risk==='Small'\?4/);
});
