import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('if(analyticsMode&&Number(d.validation?.sgpEligibleMarketRows||0)===0){');
const end=html.indexOf('}else if(analyticsMode){',start);
const code=html.slice(start,end);

test('when verified market rows are zero, all three available model SGP tiers remain visible as research',()=>{
 assert.ok(start>=0&&end>start);
 assert.ok(code.includes("d.sgps?.Analytics||[]"));
 assert.ok(code.includes("['Small','Medium','Nuke']"));
 assert.ok(code.includes('legs.map(p=>'));
 assert.ok(code.includes("nflEscape(p.player||p.name)"));
 assert.ok(!code.includes("p.target"));
 assert.ok(code.includes('Projection candidates'));
 assert.ok(!code.includes("String(p.target)+'+ '"));
 assert.ok(!code.includes('No sportsbook-selectable SGP can be generated'));
});
test('no exact sportsbook offers means no fake book prices or invented 135-yard alternatives',()=>{
 assert.ok(code.includes('Model research only • Not a selectable sportsbook parlay'));
 assert.ok(code.includes('No listed DraftKings/FanDuel line confirmed for this athlete and market'));
 assert.ok(code.includes('Combined odds not quoted'));
 assert.ok(!code.includes('actualSgpOdds'));
 assert.ok(!code.includes('135+'));
 assert.ok(code.includes('https://co.sportsbook.fanduel.com/'));
 assert.ok(code.includes('https://sportsbook.draftkings.com/'));
});
test('risk audit is collapsible and legacy paid-API spotlight wording is removed',()=>{
 assert.ok(code.includes('<details class="card"'));
 assert.ok(code.includes('Matchup &amp; SGP risk audit'));
 assert.ok(!html.includes('external API enrichment enabled'));
 assert.ok(!html.includes('external API conserved'));
});
