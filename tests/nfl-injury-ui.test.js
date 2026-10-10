import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('injury status has independent no-store refresh and never claims blank means all healthy',()=>{
 assert.ok(html.includes("'/api/nfl-injuries?'"));
 assert.ok(html.includes("cache:'no-store'"));
 assert.ok(html.includes('const intervalMs=Number.isFinite(minutes)&&minutes<=120&&minutes>=-240?30*1000:180*1000'));
 assert.ok(html.includes('Official game-day inactives not yet independently verified.'));
 assert.ok(html.includes('No injury entries returned by the available ESPN report.'));
 assert.ok(html.includes('nflMarketCache.delete(nflData.date'));
 assert.ok(html.includes('nflOpen(gameId,true)'));
 assert.ok(html.includes('momentumParlayWatch.onSnapshot(gameId'));
 assert.ok(html.includes('momentumParlayWatch.decorate(g,d)'));
 assert.ok(html.includes("if(forceFresh)q.finalCheck='1'"));
 assert.ok(!html.includes('No reported injuries in the game cross-check.'));
});
