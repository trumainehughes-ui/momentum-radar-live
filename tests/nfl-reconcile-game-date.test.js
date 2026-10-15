import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../api/nfl-readiness-reconcile.js',import.meta.url),'utf8');
test('readiness checks game identity and Eastern-local kickoff date before snapshot',()=>{
 assert.match(source,/api\/nfl-schedule\?date=/);
 assert.match(source,/nflEasternDate\(new Date\(game.kickoff\)\)!==date/);
 assert.match(source,/game_not_on_requested_eastern_date/);
 assert.ok(source.indexOf('game_not_on_requested_eastern_date')<source.indexOf('nflSgpReadinessFromBlob({date,gameId})'));
});
test('reconciliation does not publish model-only SGPs',()=>{
 assert.match(source,/publishable:quoteVerified/);
 assert.match(source,/sportsbookCombinedOddsVerified===true/);
});
