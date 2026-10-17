import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('NFL matchup UI exposes AI status and analysis navigation on every tab',()=>{
 const ui=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 assert.ok(ui.includes('Momentum AI'));
 assert.ok(ui.includes('AI review loading'));
 assert.ok(ui.includes('AI review available'));
 assert.ok(ui.includes('Historical AI review'));
 assert.ok(ui.includes('data-view="ai">Open AI analysis'));
 assert.ok(ui.includes("tabs+aiStrip+'<div class=\"detail-body\">'"));
});
