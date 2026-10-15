import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const owner=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const publicHtml=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
test('public read-only NFL game view preserves Weather Impact availability',()=>{
 assert.match(owner,/data-matchtab="weather"/);
 assert.match(publicHtml,/id="public-weather-impact"/);
 assert.match(publicHtml,/Kickoff forecasts and historical player-weather comparisons/);
});
test('public weather panel does not reveal admin access or invent bets',()=>{
 const section=publicHtml.match(/<section id="public-weather-impact"[\s\S]*?<\/section>/)?.[0];
 assert.ok(section);assert.doesNotMatch(section,/MANUAL_AI_REVIEW_SECRET|x-manual-review-secret|\+10000|\+2000/);
 assert.match(section,/No weather-adjusted player props or SGPs are currently verified/);
});
