import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('NBA.com history requests require confirmed current-game ESPN starter and team identity',()=>{
 const source=readFileSync(new URL('../api/nba-health.js',import.meta.url),'utf8');
 assert.match(source,/const candidates=selectedStarters\.startersConfirmed===true\?/);
 assert.match(source,/evidence\.playerProjections\.filter\(p=>starterMatch\(p\)&&p\.rotationEvidence\?\.eligible!==false\):\[\]/);
 assert.match(source,/const team=String\(projection\?\.team\|\|''\)\.toUpperCase\(\)/);
});
