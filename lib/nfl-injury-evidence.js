// Shared NFL injury report normalization and fail-closed pick eligibility.
// ESPN report retrieval time is NOT official source update time or game-day inactive proof.
const teamKey=x=>String(x||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
const nameKey=x=>String(x||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
const statusText=x=>{
 if(typeof x==="string")return x;
 if(!x||typeof x!=="object")return "";
 return [x.description,x.displayName,x.name,x.abbreviation,x.type?.description,
   x.type?.name,x.type?.abbreviation].filter(v=>typeof v==="string").join(" ");
};
export function nflInjuryStatus(raw){
 const s=statusText(raw).toUpperCase().replace(/[_-]/g," ").trim();
 if(!s)return "UNKNOWN";
 if(/INJURED RESERVE|RESERVE\/INJURED|\bIR\b|\bPUP\b|NON FOOTBALL INJURY|\bNFI\b/.test(s))return "IR";
 if(/\bSUSPENDED\b|\bSUSPENSION\b/.test(s))return "SUSPENDED";
 if(/\bINACTIVE\b|NOT ACTIVE/.test(s))return "INACTIVE";
 if(/\bOUT\b|RULED OUT/.test(s))return "OUT";
 if(/\bDOUBTFUL\b/.test(s))return "DOUBTFUL";
 if(/\bQUESTIONABLE\b/.test(s))return "QUESTIONABLE";
 if(/\bPROBABLE\b/.test(s))return "PROBABLE";
 if(/\bACTIVE\b|AVAILABLE|HEALTHY|FULL PARTICIPATION/.test(s))return "ACTIVE";
 return "REPORTED_OTHER";
}
export const nflInjuryBlocks=x=>["IR","INACTIVE","OUT","DOUBTFUL","SUSPENDED"].includes(x);
export const nflInjuryExcludesFromPicks=x=>nflInjuryBlocks(x)||
 ["QUESTIONABLE","REVIEW_CONFLICT","UNKNOWN","REPORTED_OTHER"].includes(x);
const rowsFrom=g=>Array.isArray(g?.injuries)?g.injuries:
 Array.isArray(g?.items)?g.items:Array.isArray(g?.athletes)?g.athletes:null;
export function nflGameInjuryEvidence({summary=null,league=null,competitors=null,checkedAt=new Date().toISOString()}={}){
 const teams=competitors||summary?.header?.competitions?.[0]?.competitors||[];
 const expected=Array.isArray(teams)?teams.map(t=>({
  id:String(t?.team?.id||""),abbr:teamKey(t?.team?.abbreviation)
 })):[];
 const valid=expected.length===2&&expected.every(t=>t.id&&t.abbr)&&
  expected[0].id!==expected[1].id&&expected[0].abbr!==expected[1].abbr;
 const gameGroups=Array.isArray(summary?.injuries)?summary.injuries:[];
 const leagueGroups=Array.isArray(league?.injuries)?league.injuries:
  Array.isArray(league?.items)?league.items:[];
 const sources=[
  ...gameGroups.map(group=>({group,origin:"ESPN game injury report"})),
  ...leagueGroups.map(group=>({group,origin:"ESPN league injury report"}))
 ];
 const coverage=new Set(),byPlayer=new Map(),conflicts=new Set();
 if(valid)for(const {group,origin} of sources){
  const id=String(group?.team?.id||""),abbr=teamKey(group?.team?.abbreviation);
  const match=expected.find(t=>(id||abbr)&&(!id||id===t.id)&&(!abbr||abbr===t.abbr));
  const records=rowsFrom(group);
  if(!match||records===null)continue;
  coverage.add(match.abbr);
  for(const item of records){
   const athlete=item?.athlete||item?.player||item||{};
   const playerId=String(athlete.id||item?.athleteId||"");
   const name=athlete.displayName||athlete.fullName||item?.displayName||item?.name||"";
   if(!playerId&&!nameKey(name))continue;
   const raw=item?.status||item?.details?.status||item?.details?.type||null;
   const st=nflInjuryStatus(raw);
   const injury={team:match.abbr,playerId,name,position:athlete.position?.abbreviation||null,
    injury:statusText(item?.details?.type)||statusText(item?.type)||item?.details?.detail||null,
    status:st,rawStatus:statusText(raw)||null,source:origin};
   const key=playerId?"id:"+match.abbr+":"+playerId:"name:"+match.abbr+":"+nameKey(name);
   if(!byPlayer.has(key)){byPlayer.set(key,injury);continue}
   const earlier=byPlayer.get(key);
   // A new, conflicting source is a review blocker, not evidence of active status.
   if(earlier.status!==injury.status){
    if(!nflInjuryExcludesFromPicks(earlier.status)&&nflInjuryExcludesFromPicks(injury.status))
     conflicts.add(key);
   }
  }
 }
 for(const key of conflicts){
  const prev=byPlayer.get(key);
  byPlayer.set(key,{...prev,status:"REVIEW_CONFLICT",
   rawStatus:"Conflicting ESPN injury designations",source:"ESPN game and league reports"});
 }
 const injuries=[...byPlayer.values()].sort((a,b)=>a.team.localeCompare(b.team)||a.name.localeCompare(b.name));
 const coveredTeams=[...coverage].sort(),reportAvailable=valid&&coverage.size===2;
 const blockers=injuries.filter(x=>nflInjuryBlocks(x.status));
 const pickBlockers=injuries.filter(x=>nflInjuryExcludesFromPicks(x.status));
 const partial=coveredTeams.length>0&&!reportAvailable;
 const status=!valid?"INVALID_GAME_TEAMS":reportAvailable?
  injuries.length?"ESPN_REPORT_AVAILABLE":"NO_ITEMS_REPORTED":
  partial?"PARTIAL_REPORT":league&&Array.isArray(leagueGroups)&&!leagueGroups.length?"NO_ITEMS_REPORTED":"REPORT_UNAVAILABLE";
 return {injuries,blockers,pickBlockers,coveredTeams,
  missingTeams:valid?expected.map(t=>t.abbr).filter(t=>!coverage.has(t)):[],
  teamCoverageVerified:reportAvailable,reportAvailable,partial,status,
  source:gameGroups.length?"ESPN game report + league fallback":
   leagueGroups.length?"ESPN league report":"ESPN feed unavailable or no team records",
  checkedAt,sourceUpdatedAt:null,officialInactivesVerified:false,
  officialInactivesSource:null,officialInactivesCheckedAt:null,
  caveat:"ESPN injury designations are not independent official NFL game-day inactive confirmation."};
}
// Use these restrictions on all player-stat categories AND on each final SGP leg.
export function nflPlayerBlockedByInjury(player,evidence){
 const id=String(player?.playerID||player?.playerId||"");
 const name=nameKey(player?.name||player?.playerName);
 const team=teamKey(player?.team||"");
 if(!id&&!name)return false;
 const source=Array.isArray(evidence?.pickBlockers)?evidence.pickBlockers:[];
 return source.some(x=>team&&teamKey(x.team)!==team?false:
  (id&&x.playerId&&id===String(x.playerId))||
  (name&&name===nameKey(x.name)));
}
