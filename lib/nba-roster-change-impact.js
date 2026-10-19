// NBA roster-change impact advisor. Deterministic and advisory only:
// verified status changes can flag affected teammates for re-projection,
// but cannot assert replacement starters or sportsbook market changes.
const allowed=new Set(['OUT','DOUBTFUL','QUESTIONABLE','AVAILABLE','ACTIVE','INACTIVE','TRADED','WAIVED']);
const safe=s=>String(s||'').trim().toUpperCase();
export function nbaRosterChangeImpact({events=[],players=[],asOf}={}){
 const at=Date.parse(asOf||'');
 if(!Number.isFinite(at))return{status:'NOT_READY',reason:'AS_OF_MISSING',impacts:[],aiReviewed:false};
 const valid=[];
 for(const e of Array.isArray(events)?events.slice(0,100):[]){
  const timestamp=Date.parse(e?.reportedAt||'');
  if(!e?.playerId||!e?.teamId||!allowed.has(safe(e.status))||
    !Number.isFinite(timestamp)||timestamp>at||!e.sourceUrl||!/^https:\/\//i.test(e.sourceUrl))continue;
  valid.push({playerId:String(e.playerId),teamId:String(e.teamId),status:safe(e.status),
   reportedAt:new Date(timestamp).toISOString(),sourceUrl:e.sourceUrl});
 }
 const byTeam=new Map();
 for(const e of valid){
  const rows=byTeam.get(e.teamId)||[];rows.push(e);byTeam.set(e.teamId,rows);
 }
 const impacts=[];
 for(const [teamId,changes] of byTeam){
  const affected=(Array.isArray(players)?players:[]).filter(p=>String(p.teamId)===teamId)
   .slice(0,30).map(p=>({playerId:String(p.id),needsReprojection:true}));
  impacts.push({teamId,changes,affected,reason:'VERIFIED_ROSTER_EVENT_REQUIRES_REPROJECTION',
   starterChangeVerified:false,minutesDelta:null,usageDelta:null,
   sportsbookMarketVerified:false});
 }
 return {status:valid.length?'REVIEW_REQUIRED':'NO_VERIFIED_EVENTS',
  asOf:new Date(at).toISOString(),impacts,verifiedEventCount:valid.length,
  requiresFreshRosterCheck:valid.length>0,requiresFreshSportsbookCheck:valid.length>0,
  aiReviewed:false,canAutoPublish:false};
}
