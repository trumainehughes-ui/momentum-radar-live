import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('../api/nfl-injuries.js',import.meta.url),'utf8');
test('read-only injury endpoint does not use stale caches or call paid sportsbooks',()=>{
 assert.ok(s.includes("res.setHeader('Cache-Control','private, no-store, max-age=0')"));
 assert.ok(s.includes("cache:'no-store'"));
 assert.ok(s.includes("ESPN+'/summary?event='"));
 assert.ok(s.includes("ESPN+'/injuries'"));
 assert.ok(!s.includes('SPORTSGAMEODDS_API_KEY'));
 assert.ok(!s.includes('THE_ODDS_API_KEY'));
});
test('pregame polling increases to 5min and does not pretend official inactives were verified',()=>{
 assert.ok(s.includes('mins<=120&&mins>=-240?5:15'));
 assert.ok(s.includes('officialInactivesRequired:pregame'));
 assert.ok(s.includes("officialInactivesStatus:pregame?'AWAITING_INDEPENDENT_VERIFICATION'"));
 assert.ok(s.includes('res.status(report.reportAvailable?200:503)'));
});
