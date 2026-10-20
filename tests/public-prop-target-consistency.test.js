import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
test('probability is shown only for exact displayed target',()=>{
 assert.match(html,/target!==probabilityTarget/);
 assert.match(html,/Probability not calculated for this target/);
});
test('public cards require verified starter and at least two games',()=>{
 assert.match(html,/x\.starterVerified===true&&Number\.isFinite\(sample\)&&sample>=2/);
});
test('chance label appears once',()=>{
 assert.doesNotMatch(html,/return 'Estimated hit probability: '/);
});
test('raw underscore trend is formatted for customers',()=>{
 assert.match(html,/replace\(\/_\/g,' '\)/);
});
