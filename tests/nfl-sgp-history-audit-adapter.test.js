import test from 'node:test';
import assert from 'node:assert/strict';
import {auditVerifiedNflSgpGrade} from '../lib/nfl-sgp-history-audit-adapter.js';
const response={ok:true,final:true,gameId:'401234567',lockedAt:'2026-11-15T17:00:00Z',sgps:[{id:'ticket1',tier:'Small',legs:[{playerId:'123',category:'receiving',target:50,direction:'over',grade:{status:'HIT',actual:65,sourceVerified:true}}]}]};
const options={kickoffAt:'2026-11-15T18:00:00Z',finalVerified:true};
test('requires independently verified final and kickoff',()=>{
 assert.equal(auditVerifiedNflSgpGrade(response,{...options,finalVerified:false}).status,'unverified_final');
 assert.equal(auditVerifiedNflSgpGrade(response,{...options,kickoffAt:'2026-11-15T16:00:00Z'}).status,'unverified_pregame');
});
test('grades explicitly verified records without publishing',()=>{
 const result=auditVerifiedNflSgpGrade(response,options);
 assert.equal(result.publishable,false);
 assert.equal(result.audit.tiers.Small.wins,1);
});
test('does not infer verified final statistics from HIT labels alone',()=>{
 const unverified={...response,sgps:[{...response.sgps[0],legs:[{...response.sgps[0].legs[0],grade:{status:'HIT',actual:65}}]}]};
 const result=auditVerifiedNflSgpGrade(unverified,options);
 assert.equal(result.audit.exclusions.incomplete_settlement,1);
 assert.deepEqual(result.audit.tiers,{});
});

test('does not substitute historical HIT labels for numeric market outcomes',()=>{
 const mislabeled={...response,sgps:[{...response.sgps[0],legs:[{
  ...response.sgps[0].legs[0],grade:{status:'HIT',actual:20,sourceVerified:true}
 }]}]};
 const result=auditVerifiedNflSgpGrade(mislabeled,options);
 assert.equal(result.audit.tiers.Small.losses,1);
 assert.equal(result.audit.tiers.Small.wins,0);
});

test('reads stored NFL threshold fields without inventing market direction',()=>{
 const base=response.sgps[0].legs[0];
 const withLine={...response,sgps:[{...response.sgps[0],legs:[{...base,target:undefined,line:60,direction:'over'}]}]};
 const measured=auditVerifiedNflSgpGrade(withLine,options);
 assert.equal(measured.audit.tiers.Small.wins,1);
 const unknown={...response,sgps:[{...response.sgps[0],legs:[{...base,target:undefined,line:60,direction:undefined}]}]};
 const rejected=auditVerifiedNflSgpGrade(unknown,options);
 assert.equal(rejected.audit.exclusions.incomplete_settlement,1);
});
