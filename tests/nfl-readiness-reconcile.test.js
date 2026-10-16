import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('NFL readiness reconciliation never treats collector models as verified bookmaker quotes',()=>{
 const code=readFileSync(new URL('../api/nfl-readiness-reconcile.js',import.meta.url),'utf8');
 assert.match(code,/readCollectorAudits\('nfl'\)/);
 assert.match(code,/nflSgpReadinessFromBlob/);
 assert.match(code,/reconcileNflReadinessStatus/);
 const classifier=readFileSync(new URL('../lib/nfl-readiness-classification.js',import.meta.url),'utf8');
 assert.match(classifier,/MODEL_READY_MARKET_SNAPSHOT_MISSING/);
 assert.match(code,/publishable:quoteVerified/);
 assert.doesNotMatch(code,/put\(|writeCollectorAudit|fetch\('https:\/\/api\.groq/);
});
