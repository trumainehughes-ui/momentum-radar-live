import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('if(analyticsMode&&Number(d.validation?.sgpEligibleMarketRows||0)===0){');
const end=html.indexOf('}else if(analyticsMode){',start);
const code=html.slice(start,end);

test('zero sportsbook rows renders all available Small Medium Nuke AI yardage tiers',()=>{
 assert.ok(start>=0&&end>start);
 assert.ok(code.includes('const tiersHtml=sgpYardageHtml'));
 assert.ok(code.includes('(tiersHtml||'));
 const model=readFileSync(new URL('../lib/nfl-sgp-model-yardage-cards.js',import.meta.url),'utf8');
 assert.ok(model.includes("['Small','Medium','Nuke']"));
 assert.ok(model.includes('tier.legs.length'));
 assert.ok(model.includes('AI yardage projection candidates'));
 assert.ok(model.includes('AI '));
 assert.ok(!code.includes('Exact sportsbook selection pending'));
});
test('model yards do not manufacture an official sportsbook offer or combined price',()=>{
 const model=readFileSync(new URL('../lib/nfl-sgp-model-yardage-cards.js',import.meta.url),'utf8');
 assert.ok(model.includes('NOT a listed betting line'));
 assert.ok(model.includes('Combined sportsbook SGP price not verified'));
 assert.ok(code.includes('Sportsbook-priced parlays are not verified'));
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
