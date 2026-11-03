import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('public SGP explains confirmed starter requirement',()=>{
 const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 assert.match(html,/Only verified current-game starters qualify for NFL SGP slips/);
 assert.match(html,/historical usage does not confirm a starter/);
});
