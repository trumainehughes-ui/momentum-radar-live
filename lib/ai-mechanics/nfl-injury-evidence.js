// ESPN injury evidence gate for a selected NFL matchup.
// One team's response, a successful HTTP response without team-level records,
// and historical season usage are not two-team injury/inactive verification.
const compact=x=>String(x??"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
const unavailable=/\b(?:OUT|DOUBTFUL|INACTIVE|INJURED RESERVE|IR|SUSPENDED|SUSPENSION|PUP|NON FOOTBALL INJURY|NFI)\b/i;
const teamRows=g=>Array.isArray(g?.injuries)?g.injuries:
  Array.isArray(g?.items)?g.items:Array.isArray(g?.athletes)?g.athletes:null;

export function assessNflTeamInjuryEvidence({teams=[],groups=[]}={}){
 const blockedIds=new Set(),blockedNames=new Set(),coveredTeams=new Set();
 const validTeams=Array.isArray(teams)?teams.filter(t=>t?.id&&t?.abbr):[];
 if(validTeams.length!==2 ||
    new Set(validTeams.map(t=>String(t.id))).size!==2 ||
    new Set(validTeams.map(t=>compact(t.abbr))).size!==2)
   return {checked:false,blockedIds,blockedNames,coveredTeams:[],
     reason:"two_unambiguous_nfl_team_ids_required"};
 for(const group of Array.isArray(groups)?groups:[]){
   const id=String(group?.team?.id??"");
   const abbr=compact(group?.team?.abbreviation);
   // Never attribute an unknown/ambiguous team to the current game.
   const team=validTeams.find(t=>
     (id||abbr) &&
     (!id || id===String(t.id)) &&
     (!abbr || abbr===compact(t.abbr)));
   const records=teamRows(group);
   if(!team || !records) continue;
   coveredTeams.add(compact(team.abbr));
   for(const record of records){
     const status=[record?.status,record?.details?.status,
       record?.status?.type,record?.athlete?.status,
       record?.athlete?.status?.type].filter(x=>typeof x==="string").join(" ");
     if(!unavailable.test(status))continue;
     const player=record?.athlete||record?.player||record;
     const playerId=String(player?.id||record?.athleteId||"");
     const name=compact(player?.displayName||player?.fullName||
       record?.displayName||record?.fullName||"");
     if(playerId)blockedIds.add(playerId);
     if(name)blockedNames.add(name);
   }
 }
 return {checked:coveredTeams.size===2,blockedIds,blockedNames,
   coveredTeams:[...coveredTeams].sort(),
   reason:coveredTeams.size===2?"both_teams_injury_groups_observed":
     "incomplete_injury_team_coverage"};
}


// Keep the game-detail roster, AI and sportsbook admission policies aligned.
// Known unavailable players remain blocked even when one team's feed failed.
// The absence of an injury record is NOT verified availability unless the
// injury snapshot explicitly covered both teams.
export function nflPlayerAvailability({
  playerId, name, injuryEvidence,
  questionableIds = new Set(), questionableNames = new Set(),
  overrideBlockedIds = new Set(), overrideBlockedNames = new Set()
} = {}) {
  const id=String(playerId??"");
  const key=compact(name);
  const blocked = Boolean(
    (id && (injuryEvidence?.blockedIds?.has(id) ||
      overrideBlockedIds.has(id))) ||
    (key && (injuryEvidence?.blockedNames?.has(key) ||
      overrideBlockedNames.has(key))));
  const checked=injuryEvidence?.checked===true;
  if(blocked)return {status:"OUT",verified:checked,eligible:false};
  const questionable=Boolean(
    (id&&questionableIds.has(id))||(key&&questionableNames.has(key)));
  if(questionable)return {status:"QUESTIONABLE",verified:checked,eligible:false};
  if(!checked)return {status:"UNVERIFIED",verified:false,eligible:false};
  return {status:"ACTIVE_ROTATION",verified:true,eligible:true};
}
