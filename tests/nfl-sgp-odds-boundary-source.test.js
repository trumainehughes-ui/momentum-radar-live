import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {NFL_SGP_TIERS,classifyNflSgpOdds,tenDollarSgpPayout}
 from '../lib/ai-mechanics/nfl-sgp-tiers.js';
const source=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
const start=source.indexOf('function sgpOddsInBand(');
const end=source.indexOf('function sgpPayoutLabel(',start);
assert.ok(start>=0&&end>start,'market SGP odds source must be available');
const inBand=vm.runInNewContext('('+source.slice(start,end).trim()+')',
 {classifyNflSgpOdds});
test('market collector and shared tier classifier agree at canonical boundaries',()=>{
 const scenarios=[
  [99,'OUTSIDE_TIER_BANDS'],[100,'Small'],[300,'Small'],[301,'Medium'],
  [800,'Medium'],[801,'Large'],[2000,'Large'],[2001,'OUTSIDE_TIER_BANDS'],
  [3000,'OUTSIDE_TIER_BANDS'],[9999,'OUTSIDE_TIER_BANDS'],[10000,'Nuke'],[10001,'Nuke']
 ];
 for(const [odds,classification] of scenarios){
  const expected=classification==='UNKNOWN'?'OUTSIDE_TIER_BANDS':classification;
  assert.equal(classifyNflSgpOdds(odds),expected,String(odds));
  for(const risk of ['Small','Medium','Large','Nuke'])
   assert.equal(inBand(risk,odds),risk===expected,risk+' '+odds);
 }
 assert.equal(inBand('Nuke',10000.5),false);
 assert.equal(inBand('Medium',3000.5),false);
 assert.equal(inBand('Small',0),false);
});
test('exact Nuke threshold makes $1,000 NET profit, not $1,000 including stake',()=>{
 assert.equal(NFL_SGP_TIERS.Nuke.minOdds,10000);
 assert.equal(NFL_SGP_TIERS.Small.maxOdds,300);
 assert.equal(NFL_SGP_TIERS.Medium.maxOdds,800);
 assert.equal(NFL_SGP_TIERS.Large.minOdds,801);
 assert.equal(tenDollarSgpPayout(10000).netProfit,1000);
 assert.equal(tenDollarSgpPayout(10000).totalReturn,1010);
});
test('single NFL SGP rule defines market builder boundaries without copied bands',()=>{
 assert.ok(source.includes('Object.entries(NFL_SGP_TIERS).map('));
 assert.ok(source.includes('classifyNflSgpOdds(value)===risk'));
 assert.ok(!source.includes('Nuke:{min:10001'));
 assert.ok(!source.includes('Small:{min:2000,max:3000'));
});
