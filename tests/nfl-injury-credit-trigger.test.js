import test from 'node:test';
import assert from 'node:assert/strict';
import {checkNflScheduledInjuryChanges} from '../lib/nfl-scheduled-injury-watch.js';
const game={gameId:'401777123'};
const base='https://momentum-radar-live.vercel.app/';
test('unchanged injuries do not issue paid refresh tokens',async()=>{
 let calls=0;
 const result=await checkNflScheduledInjuryChanges(game,{
  base,cronSecret:'test-only',fetchChange:async(url,options)=>{
   calls++;
   assert.match(url,/\/api\/nfl-detect-changes$/);
   assert.equal(options.method,'POST');
   return{ok:true,json:async()=>({ok:true,gameId:game.gameId,status:'compared',invalidations:[],changeTokenIssued:false})};
  }
 });
 assert.equal(calls,1);
 assert.equal(result.changesDetected,0);
 assert.equal(result.tokenIssued,false);
});
test('only verified game-scoped invalidations count as injury changes',async()=>{
 const result=await checkNflScheduledInjuryChanges(game,{
  base,cronSecret:'test-only',fetchChange:async()=>({ok:true,json:async()=>({
   ok:true,gameId:game.gameId,status:'compared',
   invalidations:[{gameId:'401000000'},{gameId:game.gameId}],
   changeTokenIssued:true,modelRefresh:{status:'completed'}
  })})
 });
 assert.equal(result.changesDetected,1);
 assert.equal(result.tokenIssued,true);
 assert.equal(result.modelRefreshStatus,'completed');
});
test('missing injury evidence does not authorize refresh',async()=>{
 const result=await checkNflScheduledInjuryChanges(game,{
  base,cronSecret:'test-only',fetchChange:async()=>({ok:true,json:async()=>({
   ok:true,gameId:game.gameId,status:'insufficient_injury_evidence',
   invalidations:[],changeTokenIssued:false
  })})
 });
 assert.equal(result.tokenIssued,false);
 assert.equal(result.changesDetected,0);
});
