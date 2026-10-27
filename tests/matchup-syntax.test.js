import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
test('matchup research endpoint passes node syntax check',()=>{
 const file=new URL('../api/matchup-research.js',import.meta.url);
 assert.doesNotThrow(()=>execFileSync(process.execPath,['--check',file.pathname],{encoding:'utf8'}));
});
