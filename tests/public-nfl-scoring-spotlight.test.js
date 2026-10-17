import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflScoringSpotlights} from '../lib/nfl-game-spotlight.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const page=read('../picks.html');
test('customer-facing NFL stars mirror source-backed schedule game totals and the AI review',()=>{
 const sch=read('../api/nfl-schedule.js'),ai=read('../lib/pregame-ai-review.js');
 assert.ok(sch.includes('spotlight:highTotal[String(g.gameId)]||null'));
 assert.ok(ai.includes("safeNflSpotlightForAi(game.spotlight,game.gameId)"));
 assert.ok(page.includes('gameSpotlightHtml(g)+'));
 assert.ok(page.includes('High-scoring watch'));
 assert.ok(page.includes('ESPN game O/U'));
 assert.ok(page.includes('Market total, not guaranteed scoring or a betting edge.'));
 assert.ok(!page.includes('Most popular game'));
 assert.ok(page.includes('id="nba-module-tabs"'));
});
test('one or zero eligible games yields no star, so popularity is never guessed',()=>{
 const base={status:'SCHEDULED',kickoff:'2026-10-18T17:00:00Z'};
 assert.deepEqual(nflScoringSpotlights([{...base,gameId:'401872999',gameTotal:51.5}]),{});
 assert.deepEqual(nflScoringSpotlights([{...base,gameId:'401872999',gameTotal:42},
  {...base,gameId:'401873004',gameTotal:41}]),{});
});
