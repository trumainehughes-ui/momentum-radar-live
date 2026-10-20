import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
test('NBA stat category tabs use research fallback when no verified legs exist',()=>{
 assert.match(page,/const research=nbaResearchCandidates\(d,state\.nbaTab\)/);
 assert.match(page,/research\.map\(nbaResearchRow\)/);
 assert.match(page,/Historical model estimates only; starter and sportsbook verification pending/);
});
test('NBA category research rows do not claim sportsbook verification',()=>{
 assert.match(page,/Not a sportsbook offer or confirmed starter/);
});
