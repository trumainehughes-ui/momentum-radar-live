import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NBA_TIERS,nbaNotReadyTiers} from '../lib/nba-data-model.js';
const model=readFileSync(new URL('../lib/nba-pregame-model.js',import.meta.url),'utf8');
test('NBA shared research tiers include Large without verified sportsbook claims',()=>{
 assert.deepEqual(Object.keys(NBA_TIERS),['Small','Medium','Large','Nuke']);
 assert.equal(NBA_TIERS.Large.min,6);
 assert.deepEqual(nbaNotReadyTiers('no markets').map(x=>x.risk),Object.keys(NBA_TIERS));
});
test('NBA pregame builds all four tiers and uses elevated Large thresholds',()=>{
 assert.match(model,/sgps:\['Small','Medium','Large','Nuke'\]\.map\(select\)/);
 assert.match(model,/if\(risk==='Large'\)return Math\.max\(step,Math\.ceil\(c\.projection\*1\.12\/step\)\*step\)/);
 assert.match(model,/publishable:false/);
});
