import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('public read-only passing cards carry owner verified starter role',()=>{
 const s=readFileSync(new URL('../lib/public-nfl-view.js',import.meta.url),'utf8');
 assert.ok(s.includes('starterVerified:x.starterVerified===true'));
 assert.ok(s.includes("starterRoleVerified:cat==='passing'"));
});
