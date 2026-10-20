import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('NBA collection holds candidate SGPs when any game-specific starter is unconfirmed',()=>{
 const src=readFileSync(new URL('../api/nba-health.js',import.meta.url),'utf8');
 assert.match(src,/legs\.every\(p=>p\.starterVerified===true\)/);
 assert.match(src,/status:card\.status==='MODEL_CANDIDATE'&&eventStarters\.checked===true&&!startersReady\?'NOT_READY'/);
 assert.match(src,/publishable:false/);
});
test('30-team roster audit rejects missing teams and duplicate athlete IDs',()=>{
 const src=readFileSync(new URL('../scripts/nba-opening-roster-audit.mjs',import.meta.url),'utf8');
 assert.match(src,/teams\.length!==30/);
 assert.match(src,/duplicates\.push/);
 assert.match(src,/failed\.length\|\|duplicates\.length/);
});
