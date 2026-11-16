import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const owner=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const publicPage=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
test('public read-only SGP page mirrors mobile presentation without publishing controls',()=>{
 for(const token of ['.nflSgpMini[data-risk="Large"]','.nflMatchTabs{position:sticky','.mr-model-sgp-leg,.nflSgpMini .sgpLeg','scroll-margin-top:calc(var(--mr-header-height,0px) + 70px)']){
  assert.ok(owner.includes(token),'owner missing '+token);
  assert.ok(publicPage.includes(token),'public missing '+token);
 }
});
