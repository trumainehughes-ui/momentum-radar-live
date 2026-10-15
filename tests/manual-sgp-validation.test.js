import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManualSgp} from '../lib/manual-sgp-validation.js';
const legs=[{playerId:'a',market:'passing_yards',threshold:250,gameId:'g',book:'DK',oddsVerified:true,marketVerifiedAt:'2026-10-15T00:00:00Z'},
{playerId:'b',market:'receptions',threshold:5,gameId:'g',book:'DK',oddsVerified:true,marketVerifiedAt:'2026-10-15T00:00:00Z'}];
test('small tier requires actual combined odds +2000 to +3000',()=>{assert.equal(validateManualSgp({sport:'NFL',tier:'Small',legs,combinedAmericanOdds:2500,book:'DK',gameId:'g'}).valid,true);assert.equal(validateManualSgp({sport:'NFL',tier:'Small',legs,combinedAmericanOdds:200,book:'DK',gameId:'g'}).valid,false)});
test('nuke must exceed +10000',()=>{assert.equal(validateManualSgp({sport:'NFL',tier:'Nuke',legs,combinedAmericanOdds:10000,book:'DK',gameId:'g'}).valid,false)});
test('cross-book legs blocked',()=>{assert.equal(validateManualSgp({sport:'NFL',tier:'Medium',legs:[legs[0],{...legs[1],book:'FD'}],combinedAmericanOdds:5000,book:'DK',gameId:'g'}).valid,false)});
test('NBA payouts cannot be assumed from NFL bands',()=>{assert.equal(validateManualSgp({sport:'NBA',tier:'Nuke',legs,combinedAmericanOdds:15000,book:'DK',gameId:'g'}).valid,false)});
