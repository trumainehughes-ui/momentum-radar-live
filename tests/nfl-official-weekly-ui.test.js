import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../api/nfl-injuries.js',import.meta.url),'utf8');
const markets=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
const game=readFileSync(new URL('../api/nfl-game.js',import.meta.url),'utf8');
test('injury UI renders separate team headings, clear statuses and dated official source',()=>{
 for(const fragment of ['nflInjuryTeam','nflInjurySection','nflInjuryStatus.OUT','nflInjuryStatus.DOUBTFUL','nflInjuryStatus.QUESTIONABLE','nflInjuryRefreshBtn','NFL published weekly report:','Official weekly game statuses have NOT been cross-checked','Reserve / long-term injuries','Additional ESPN tracker entries'])
  assert.ok(html.includes(fragment),fragment);
 assert.ok(html.includes('gameDesignationVerified'));
 assert.ok(html.includes('weeklySourceUrl'));
 assert.ok(!html.includes('ESPN checked '+"'+safe(time)+' • Source publication time not supplied"));
});
test('official published cross-check is shared by injury API, game roster, and final SGP eligibility',()=>{
 assert.ok(source.includes('nflPublishedWeeklyGameReport({gameId,date:comp.date,teams:competitors})'));
 assert.ok(game.includes('nflPublishedWeeklyGameReport({gameId,date:comp.date,teams:competitors})'));
 assert.ok(markets.includes('nflPublishedWeeklyGameReport({gameId,date:comp.date,teams})'));
 assert.ok(game.includes('blockedNames=new Set(blockers.flatMap'));
 assert.ok(markets.includes('...(x.aliases||[])'));
 assert.ok(markets.includes("CACHE_SCHEMA='v85-official-weekly-reconcile'"));
});
