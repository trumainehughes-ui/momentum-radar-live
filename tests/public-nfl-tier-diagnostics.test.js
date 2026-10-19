import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('public NFL API provides only sanitized model tier readiness',()=>{
 const s=readFileSync(new URL('../api/public-nfl-game.js',import.meta.url),'utf8');
 assert.ok(s.includes("const modelTierStatus=['Small','Medium','Nuke'].map"));
 assert.ok(s.includes("(safe.modelResearchTiers||[]).find"));
 assert.ok(s.includes("status:tier?.complete===true?'MODEL_RESEARCH_READY'"));
 assert.ok(s.includes("'NO_VALID_MODEL_TIER'"));
 assert.ok(s.includes('json({...safe,modelTierStatus,'));
 assert.ok(!s.includes('modelTierStatus:raw.sgps'));
});

test('public cards explain absent AI tiers without claiming verified odds',()=>{
 const page=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 assert.ok(page.includes('MODEL_RESEARCH_INCOMPLETE'));
 assert.ok(page.includes('No valid '));
 assert.ok(page.includes('Model predictions are not verified sportsbook offers.'));
});
