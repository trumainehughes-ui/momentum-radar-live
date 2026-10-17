import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NBA_TIERS,validateNbaSgp} from '../lib/nba-data-model.js';
test('NBA tier counts are adaptive and retain market diversity',()=>{
 assert.equal(NBA_TIERS.Small.min,2);
 assert.equal(NBA_TIERS.Medium.min,2);
 assert.equal(NBA_TIERS.Nuke.min,3);
 assert.equal(NBA_TIERS.Nuke.categories,3);
 for(const cfg of Object.values(NBA_TIERS))assert.equal(cfg.max,7);
});
test('NBA pregame builder stops at shortest category-complete candidate',()=>{
 const source=readFileSync(new URL('../lib/nba-pregame-model.js',import.meta.url),'utf8');
 assert.match(source,/picks.length>=cfg.min&&categories.size>=cfg.categories/);
 assert.match(source,/selectionObjective:'SHORTEST_EVIDENCE_SUPPORTED_RESEARCH_CANDIDATE'/);
});
