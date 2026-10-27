import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../api/nfl-health.js',import.meta.url),'utf8');
test('signed NFL collector checks two days ahead without changing the 30-hour due-game budget',()=>{
 assert.match(source,/const dates=cron\?\[today,nflAddDate\(today,1\),nflAddDate\(today,2\)\]/);
 assert.match(source,/const allDue=nflCollectorDueGames\(games\)/);
});
test('signed NFL collector fails closed while read-only public off-day health remains idle',()=>{
 assert.match(source,/if\(!games\.length&&cron\)blocking\.push\('games'\)/);
 assert.match(source,/if\(schedules\.every\(s=>!s\.ok\)\)blocking\.push\('schedule'\)/);
});

test('fallback model research excludes out, questionable and inactive players with real word boundaries',()=>{
 assert.ok(source.includes('/\\b(OUT|INACTIVE|IR|DOUBTFUL|QUESTIONABLE|SUSPENDED)\\b/i.test('));
 assert.ok(!source.includes('/\\\\b(OUT|INACTIVE|IR|DOUBTFUL|QUESTIONABLE|SUSPENDED)\\\\b/i.test('));
});
