import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('composition-only NFL SGP cards cannot inherit publishable or book quote flags',()=>{
 const source=readFileSync(new URL('../lib/ai-mechanics/nfl-sgp-tiers.js',import.meta.url),'utf8');
 const guard=source.slice(source.indexOf('export function guardFinalNflSgpCards'),source.indexOf('export function modelNflSgpStatThreshold'));
 assert.match(guard,/if\(tierAssessment\.compositionOk&&!injuryPruned&&!identityFailed&&activeRoleOk\)/);
 assert.match(guard,/publishable:false,combinedBookQuoteVerified:false,tierVerified:false/);
 assert.match(guard,/payoutTargetVerified:false,actualSgpOdds:null/);
});
