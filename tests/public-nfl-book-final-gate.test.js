import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('public book SGP cards require current verified game-day inactives',()=>{
 const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 assert.match(html,/const eligible=snapshotFresh&&d\.inactivesVerified===true&&\s*d\.finalRosterCheck\?\.ready===true/);
 assert.match(html,/const cards=eligible&&Array\.isArray\(d\.verifiedBookParlays\)/);
});
