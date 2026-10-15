// Pure cache-summary logic for the zero-credit review endpoint.
export function summarizeManualSnapshot({sport,gameId,snapshot}) {
 if(!['NFL','NBA'].includes(sport)||!/^\d{7,12}$/.test(String(gameId)))throw Error('invalid_game');
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))throw Error('invalid_snapshot');
 if(String(snapshot.gameId)!==String(gameId))throw Error('snapshot_identity_mismatch');
 const checkedAt=snapshot.checkedAt||snapshot.updatedAt||snapshot.fetchedAt||null;
 const timestamp=checkedAt&&Number.isFinite(Date.parse(checkedAt))?checkedAt:null;
 const tiers=Array.isArray(snapshot.sgps)?snapshot.sgps.filter(x=>x&&typeof x==='object').map(s=>({
  risk:String(s.risk||'Unknown'),status:String(s.status||'UNKNOWN'),
  legCount:Array.isArray(s.legs)?s.legs.length:0
 })):[];
 return {ok:true,sport,gameId:String(gameId),status:'cached_review_only',
  paidSportsApiCalls:0,updatedAt:timestamp,stale:!timestamp||Date.now()-Date.parse(timestamp)>15*60*1000,
  tiers,modelVersion:snapshot.modelVersion||null,
  publicationBlocked:true,aiReanalysisPerformed:false,
  message:'Read-only cached snapshot. No AI rebuild, fresh injuries, sportsbook repricing or SGP publication.'};
}
