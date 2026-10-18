import test from 'node:test';
import assert from 'node:assert/strict';
import {scorerAbbr} from '../api/nfl-live.js';

test('rushing TD scorer resolves after ESPN eligible-lineman preamble',()=>{
 const play='B.Fisher reported in as eligible.  J.Jordan left tackle for 25 yards, TOUCHDOWN. K.Fairbairn extra point is GOOD.';
 assert.equal(scorerAbbr(play),'J.Jordan');
});
test('shotgun rushing and quarterback sneaks remain recognized',()=>{
 assert.equal(scorerAbbr('(Shotgun) D.Swift right guard for 2 yards, TOUCHDOWN. Extra point good.'),'D.Swift');
 assert.equal(scorerAbbr('T.Shough up the middle for 1 yard, TOUCHDOWN. Extra point good.'),'T.Shough');
});
test('passing touchdowns attribute receiver rather than quarterback',()=>{
 assert.equal(scorerAbbr('(Shotgun) C.Stroud pass short right to F.Moreau for 6 yards, TOUCHDOWN. Extra point.'),'F.Moreau');
 assert.equal(scorerAbbr('W.Milum reported in as eligible. T.Lawrence pass short left to T.Hunter for 7 yards, TOUCHDOWN.'),'T.Hunter');
});
test('ambiguous or overturned touchdowns never receive guessed player attribution',()=>{
 assert.equal(scorerAbbr('K.Fairbairn extra point is GOOD.'),'');
 assert.equal(scorerAbbr('J.Jordan left tackle for 25 yards, touchdown overturned by penalty.'),'');
 assert.equal(scorerAbbr('Pass intercepted and returned for TOUCHDOWN.'),'');
});
