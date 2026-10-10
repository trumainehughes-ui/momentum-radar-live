import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('../api/nfl-injury-board.js',import.meta.url),'utf8');
test('all-matchup board pulls scheduled events and official weekly source, never bookmaker quotas',()=>{
 assert.ok(s.includes("const scoreboard=await rsp.json(),games=scoreboard.events||[]"));
 assert.ok(s.includes('for(const event of games)'));
 assert.ok(s.includes('await nflOfficialWeeklyFromLeague({year,week,teams,'));
 assert.ok(s.includes('officialInactivesVerified:false'));
 assert.ok(!s.includes('SPORTSGAMEODDS_API_KEY'));
 assert.ok(!s.includes('THE_ODDS_API_KEY'));
});
