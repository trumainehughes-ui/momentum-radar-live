import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
test('public NFL player forecast board reads saved model research independent of sportsbook quote gates',()=>{
 assert.match(html,/const savedTiers=snapshotFresh&&Array\.isArray\(d\.modelResearchTiers\)/);
 assert.match(html,/for\(const card of savedTiers\)/);
 assert.match(html,/playerForecasts\.push\(\{\.\.\.leg,category,projection\}\)/);
 assert.match(html,/AI Player Matchup Advantages/);
 assert.match(html,/No sportsbook odds or prop lines required/);
});
test('incomplete SGP cards stay not ready while player forecasts have a separate panel',()=>{
 assert.match(html,/if\(!researchComplete\)return/);
 assert.match(html,/NOT READY<\/strong>/);
 assert.match(html,/finalInactivesWarning\+playerEdgeHtml\+verifiedSections/);
});
