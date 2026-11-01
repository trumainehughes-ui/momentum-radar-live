import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('NFL collector health counts model-only fallback as research, including Large',()=>{
 const src=readFileSync(new URL('../api/nfl-health.js',import.meta.url),'utf8');
 assert.match(src,/\['DATA_MODEL','PLUGIN_COMPATIBLE_MODEL_FALLBACK'\]\.includes\(x\.source\)/);
 assert.match(src,/publicModelTierCounts:Object\.fromEntries\(\['Small','Medium','Large','Nuke'\]/);
 assert.match(src,/publicTierCounts:historyLocks\.reduce/);
 assert.match(src,/modelTierReadinessCounts:historyLocks\.reduce/);
});
