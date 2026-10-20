import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../api/nba-health.js',import.meta.url),'utf8');
test('NBA historical evidence ranking invalidates previous pregame snapshots',()=>{
 assert.match(source,/NBA_PREGAME_MODEL_VERSION='v8-expanded-prior-season-sample-rebuild-evidence-v2'/);
 assert.match(source,/prior\.modelVersion!==NBA_PREGAME_MODEL_VERSION/);
});
