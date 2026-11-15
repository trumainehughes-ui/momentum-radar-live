import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('NBA SGP ready-like statuses are held without game-scoped confirmed starters',()=>{
 const source=readFileSync(new URL('../api/nba-health.js',import.meta.url),'utf8');
 const begin=source.indexOf('sgps:(evidence.sgps||[]).map(card=>');
 assert.ok(begin>=0);
 const section=source.slice(begin,source.indexOf('starterEvidence:',begin));
 assert.match(section,/const confirmed=selectedStarters\.startersConfirmed===true&&starterMatch\(p\)/);
 assert.match(section,/const readyLike=new Set\(\['MODEL_CANDIDATE','READY','VERIFIED','PUBLISHABLE'\]\)/);
 assert.match(section,/const held=!startersReady&&readyLike\.has\(String\(card\.status\|\|''\)\.toUpperCase\(\)\)/);
 assert.match(section,/status:held\?'NOT_READY':card\.status/);
 assert.match(section,/publishable:false/);
});
