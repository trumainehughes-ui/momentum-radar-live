import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const owner=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const publicHtml=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
test('public read-only NFL game view preserves Weather Impact availability',()=>{
 assert.match(owner,/data-matchtab="weather"/);
 assert.match(publicHtml,/id="public-weather-impact"/);
 assert.match(publicHtml,/id="public-weather-content"/);
 assert.match(publicHtml,/loadPublicWeather\(state.date,String\(id\)\)/);
 assert.match(publicHtml,/\/api\/public-nfl-weather\?/);
});
test('public weather panel does not reveal admin access or invent bets',()=>{
 const section=publicHtml.match(/<section id="public-weather-impact"[\s\S]*?<\/section>/)?.[0];
 assert.ok(section);assert.doesNotMatch(section,/MANUAL_AI_REVIEW_SECRET|x-manual-review-secret|\+10000|\+2000/);
 assert.match(section,/Open a matchup to see its kickoff forecast/);
 assert.ok(!section.includes('No weather-adjusted player props or SGPs are currently verified'));
});
