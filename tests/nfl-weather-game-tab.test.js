import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('NFL game view includes Weather Impact tab and matching scroll target',()=>{
 assert.match(html,/data-matchtab="weather"/);
 assert.match(html,/id="nflWeatherImpact" data-matchpanel="weather"/);
 assert.match(html,/Weather analysis is not yet connected to this game/);
});
test('weather game panel does not expose admin credentials or fabricated odds',()=>{
 const section=html.match(/<section id="nflWeatherImpact"[\s\S]*?<\/section>/)?.[0];
 assert.ok(section);
 assert.doesNotMatch(section,/MANUAL_AI_REVIEW_SECRET|x-manual-review-secret|\+10000|\+2000/);
});
