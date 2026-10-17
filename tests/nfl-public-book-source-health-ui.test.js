import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('FanDuel source health is displayed without fabricating odds',()=>{
 const ui=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 const api=readFileSync(new URL('../api/nfl-public-book-research.js',import.meta.url),'utf8');
 assert.match(ui,/sourceHealth\?\.FanDuel\?\.requiresMachineReadableMarketFeed/);
 assert.match(ui,/No FanDuel odds inferred/);
 assert.match(ui,/summary\+'<\/p>'\+sourceWarning\+/);
 assert.match(api,/report\.sourceHealth=/);
 assert.match(api,/noPriceInference:true/);
});
