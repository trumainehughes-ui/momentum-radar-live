import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchEspnNflRoster} from '../lib/nfl-roster-evidence.js';

test('ESPN roster fetch retains identity without granting starter clearance',async()=>{
 const athlete={id:'123456',displayName:'Test Quarterback',position:{abbreviation:'QB'}};
 const result=await fetchEspnNflRoster('GB',{fetchImpl:async(url,options)=>{
  assert.match(url,/teams\/gb\/roster$/);
  assert.equal(options.redirect,'error');
  return {ok:true,headers:{get:()=>null},json:async()=>({athletes:[{items:[athlete]}]})};
 }});
 assert.equal(result.ok,true);
 assert.equal(result.athletes[0].name,'Test Quarterback');
 assert.equal(result.verifiedActiveStarters,false);
});
test('ESPN roster fetch fails closed on invalid input and unavailable feeds',async()=>{
 assert.equal((await fetchEspnNflRoster('../bad')).reason,'INVALID_REQUEST');
 const unavailable=await fetchEspnNflRoster('GB',{fetchImpl:async()=>({ok:false,status:503})});
 assert.equal(unavailable.ok,false);
 assert.deepEqual(unavailable.athletes,[]);
});
