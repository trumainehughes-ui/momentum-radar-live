// Shared, fail-closed ESPN NFL injury-evidence normalization.
// Fetched now != source-published now, and ESPN report != official NFL game-day inactives.
const teamKey=x=>String(x||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
const nameKey=x=>String(x||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
export function nflInjuryStatus(raw){
 const s=String(raw||"").toUpperCase().replace(/[_-]/g," ").trim();
 if(!s)return "UNKNOWN";
 if(/INJURED RESERVE|RESERVE\/INJURED|\bIR\b|\bPUP\b|NON FOOTBALL INJURY|\bNFI\b/.test(s))return "IR";
 if(/\bINACTIVE\b|NOT ACTIVE/.test(s))return "INACTIVE";
 if(/\bOUT\b|RULED OUT/.test(s))return "OUT";
 if(/\bDOUBTFUL\b/.test(s))return "DOUBTFUL";
 if(/\bQUESTIONABLE\b/.test(s))return "QUESTIONABLE";
 if(/\bPROBABLE\b/.test(s))return "PROBABLE";
 if(/\bACTIVE\b|AVAILABLE|HEALTHY|FULL PARTICIPATION/.test(s))return "ACTIVE";
 return "REPORTED_OTHER";
}
export const nflInjuryBlocks=x=>["IR","INACTIVE","OUT","DOUBTFUL"].includes(x);
export function nflGameInjuryEvidence({summary=null,league=null,competitors=null,checkedAt=new Date().toISOString()}={}){
 const teams=competitors||summary?.header?.competitions?.[0]?.competitors||[];
 const ids=new Set(teams.map(t=>String(t.team?.id||"")).filter(Boolean));
 const abbrs=new Set(teams.map(t=>teamKey(t.team?.abbreviation)).filter(Boolean));
 const gameGroups=Array.isArray(summary?.injuries)?summary.injuries:null;
 const leagueGroups=Array.isArray(league?.injuries)?league.injuries:Array.isArray(league?.items)?league.items:null;
 const reportAvailable=Boolean(gameGroups?.length)||leagueGroups!==null;
 const candidates=[
  ...(gameGroups||[]).map(g=>({group:g,origin:"ESPN game injury report"})),
  ...(leagueGroups||[]).map(g=>({group:g,origin:"ESPN league injury report"}))
 ];
 const byPlayer=new Map();
 for(const {group,origin} of candidates){
  const team=group.team||{},abbr=teamKey(team.abbreviation);
  if(!ids.has(String(team.id||""))&&!abbrs.has(abbr))continue;
  const scopedTeam=abbrs.has(abbr)?abbr:teamKey(teams.find(t=>String(t.team?.id||"")===String(team.id||""))?.team?.abbreviation);
  for(const item of group.injuries||[]){
   const athlete=item.athlete||{},playerId=String(athlete.id||""),name=athlete.displayName||athlete.fullName||item.name||"";
   const key=playerId?"id:"+playerId:"name:"+scopedTeam+":"+nameKey(name);
   if(!playerId&&!nameKey(name))continue;
   const rawStatus=item.status||item.details?.status||item.details?.type?.description||"";
   const status=nflInjuryStatus(rawStatus);
   const injury={team:scopedTeam,playerId,name,position:athlete.position?.abbreviation||null,
    injury:item.details?.type||item.type?.description||item.details?.detail||null,
    status,rawStatus:rawStatus||null,source:origin};
   // Game-specific report wins on collisions; league supplements any missing players.
   if(!byPlayer.has(key))byPlayer.set(key,injury);
  }
 }
 const injuries=[...byPlayer.values()].sort((a,b)=>a.team.localeCompare(b.team)||a.name.localeCompare(b.name));
 const blockers=injuries.filter(x=>nflInjuryBlocks(x.status));
 return{injuries,blockers,reportAvailable,
  status:!reportAvailable?"REPORT_UNAVAILABLE":!injuries.length?"NO_ITEMS_REPORTED":"ESPN_REPORT_AVAILABLE",
  source:gameGroups?.length?"ESPN game report + league fallback":leagueGroups!==null?"ESPN league report":"ESPN game report",
  checkedAt,sourceUpdatedAt:null,officialInactivesVerified:false,
  officialInactivesSource:null,officialInactivesCheckedAt:null,
  caveat:"ESPN report status checked; NFL/team official game-day inactive list is not independently verified."};
}
