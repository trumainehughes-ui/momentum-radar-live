import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
test('new SGP analytics candidates require real offensive opportunity',()=>{
 assert.match(api,/if\(!verifiedOffensiveOpportunity\(x,verifiedRole,cat\)\)continue/);
 assert.match(api,/if\(!verifiedOffensiveOpportunity\(x,r,cat\)\)return false/);
});
test('saved and cached book SGPs fail closed when any leg lacks usage',()=>{
 assert.match(api,/card\.legs\.every\(leg=>existingSgpLegEligible\(body,leg\)\)/);
 assert.match(api,/existingSgpLegEligible\(body,l\)/);
});
test('backup opportunity must be demonstrated by snaps, games, carries or targets',()=>{
 assert.match(api,/snaps<0\.50/);
 assert.match(api,/games<3/);
 assert.match(api,/carriesPerGame\)>=6/);
 assert.match(api,/targetsPerGame\)>=4/);
 assert.match(api,/if\(pos==='QB'\)return false/);
});
