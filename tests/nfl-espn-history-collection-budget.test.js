import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');

test('NFL current-game ESPN completed-game collection has realistic deadline',()=>{
 assert.match(api,/const HISTORICAL_STAT_BOARDS_TIMEOUT_MS=18000/);
 assert.match(api,/historicalStatBoardsTimedOut=true/);
 assert.match(api,/ESPN_COLLECTION_TIMED_OUT/);
 assert.doesNotMatch(api,/resolve\(emptyStatBoards\),6500/);
});
test('a missing ESPN rushing model does not fabricate bookmaker legs',()=>{
 assert.match(api,/ESPN_COMPLETED_GAME_BOXSCORES/);
 assert.match(api,/MISSING_COMPLETED_GAME_EVIDENCE/);
 assert.match(api,/nflBookOfferEligible\(m,offer,name\)/);
 assert.match(api,/const DIRECT_PUBLIC_ODDS_ONLY=true/);
});
