// Run the existing signed NFL injury-change detector during league-wide cron
// collection. Routine refreshes use ESPN evidence only; they never mint a
// paid-provider token unless the detector observes a genuine status change.
// Return a bounded public-safe summary: no athlete identity or token leaks.
const ALLOWED=new Set(['compared','baseline_created','insufficient_injury_evidence']);
export async function checkNflScheduledInjuryChanges(game,{
 base,cronSecret,fetchChange=fetch
}={}){
 const gameId=String(game?.gameId||'');
 if(!/^[0-9]{7,12}$/.test(gameId)||!cronSecret||typeof fetchChange!=='function')
  return{status:'NOT_CONFIGURED',changesDetected:0,tokenIssued:false};
 let target;
 try{
  target=new URL(base);
  if(target.protocol!=='https:'||!target.hostname.endsWith('.vercel.app')||
    !(target.hostname==='momentum-radar-live.vercel.app'||
      target.hostname.startsWith('momentum-radar-live-'))||
    target.username||target.password||target.pathname!=='/'||target.search||
    target.hash||target.port)
   throw Error('invalid_origin');
 }catch{
  return{status:'UNTRUSTED_ORIGIN',changesDetected:0,tokenIssued:false};
 }
 try{
  const response=await fetchChange(target.origin+'/api/nfl-detect-changes',{
   method:'POST',cache:'no-store',
   headers:{Authorization:'Bearer '+cronSecret,
    'Content-Type':'application/json'},
   body:JSON.stringify({gameId}),
   signal:AbortSignal.timeout(52000)
  });
  if(!response.ok)
   return{status:'DETECTOR_UNAVAILABLE',changesDetected:0,
    tokenIssued:false,httpStatus:Number(response.status)||null};
  const result=await response.json();
  if(result?.ok!==true||String(result.gameId)!==gameId)
   return{status:'DETECTOR_RESPONSE_INVALID',changesDetected:0,
    tokenIssued:false};
  const count=Array.isArray(result.invalidations)?
   Math.min(100,result.invalidations.filter(x=>String(x.gameId)===gameId).length):0;
  return{status:ALLOWED.has(result.status)?result.status:'DETECTOR_RESPONSE_INVALID',
   changesDetected:count,
   tokenIssued:count>0&&result.changeTokenIssued===true,
   modelRefreshStatus:count>0&&['completed','failed','timeout_or_unavailable']
    .includes(result.modelRefresh?.status)?result.modelRefresh.status:null,
   modelRefreshHttpStatus:Number.isInteger(result.modelRefresh?.httpStatus)&&
    result.modelRefresh.httpStatus>=100&&result.modelRefresh.httpStatus<=599?
     result.modelRefresh.httpStatus:null};
 }catch{
  return{status:'DETECTOR_UNAVAILABLE',changesDetected:0,tokenIssued:false};
 }
}
