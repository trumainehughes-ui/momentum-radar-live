// Source-bound AI review orchestrator; caller supplies an authenticated, rate-limited AI adapter.
// It never calls paid sports-data APIs, mutates stored snapshots or publishes picks.
import {manualAiEvidencePacket,validateManualAiReview} from './manual-ai-evidence.js';
export async function runManualEvidenceAiReview({sport,game,snapshot,reviewAi,now=Date.now(),maxAgeMs=15*60*1000}) {
 if(typeof reviewAi!=='function')throw Error('ai_adapter_missing');
 const packet=manualAiEvidencePacket({sport,game,snapshot});
 const checked=Date.parse(packet.sourceTimestamp||'');
 if(!Number.isFinite(checked)||checked>now||now-checked>maxAgeMs)
  return {status:'STALE_EVIDENCE',canPublish:false,paidSportsApiCalls:0,aiInvoked:false};
 let response;
 try{response=await reviewAi({
  mode:sport==='NBA'?'nbaPregame':'parlay',
  gameId:packet.gameId,evidenceDigest:packet.digest,
  data:packet.evidence,allowPaidSportsApi:false
 });}catch{
  return {status:'AI_UNAVAILABLE',canPublish:false,paidSportsApiCalls:0,aiInvoked:true};
 }
 const validated=validateManualAiReview({packet,response});
 if(!validated.ok)return {status:'REVIEW_REJECTED',reason:validated.reason,
  canPublish:false,paidSportsApiCalls:0,aiInvoked:true};
 return {status:'AI_REVIEWED',...validated,paidSportsApiCalls:0,aiInvoked:true,
  sourceTimestamp:packet.sourceTimestamp};
}
