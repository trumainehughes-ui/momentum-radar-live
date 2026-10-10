// Current-game ESPN roster starter evidence, never historical depth-chart
// inference. A player's explicit source ID must match the independent team
// roster player ID. Text such as "starter", "QB1", or "high usage" is not proof.
const norm=x=>String(x??"").toUpperCase().replace(/[^A-Z0-9]/g,"");
export function reconcileEspnGameStarters({
  gameId,sourceGameId,competitors=[],rosters=[],rosterCandidates=[],
  blockedIds=new Set(),now,kickoff
}={}){
  const empty=[];
  if(!gameId || (sourceGameId&&String(sourceGameId)!==String(gameId)) ||
     !Number.isFinite(now)||!Number.isFinite(kickoff)||now>kickoff||
     kickoff-now>90*60*1000||
     !Array.isArray(competitors)||competitors.length!==2||
     !Array.isArray(rosters)||!Array.isArray(rosterCandidates))return empty;
  const teams=competitors.map(c=>({
    id:String(c?.team?.id||""),abbr:norm(c?.team?.abbreviation)
  }));
  if(teams.some(t=>!t.id||!t.abbr) ||
     teams[0].id===teams[1].id||teams[0].abbr===teams[1].abbr)return empty;
  const candidates=new Map(),ambiguous=new Set();
  for(const p of rosterCandidates){
    const id=String(p?.playerId||"");
    if(!id)continue;
    if(candidates.has(id))ambiguous.add(id);else candidates.set(id,p);
  }
  const observedAt=new Date(now).toISOString();
  const found=[];
  for(const group of rosters){
    const id=String(group?.team?.id||"");
    const abbr=norm(group?.team?.abbreviation);
    const team=teams.find(t=>(id||abbr)&&(!id||id===t.id)&&
      (!abbr||abbr===t.abbr));
    if(!team)continue;
    const rows=Array.isArray(group.roster)?group.roster:
      Array.isArray(group.athletes)?group.athletes:[];
    for(const row of rows){
      if(row?.starter!==true&&row?.isStarter!==true)continue;
      const athlete=row?.athlete||row;
      const playerId=String(athlete?.id||"");
      const p=candidates.get(playerId);
      if(!playerId||ambiguous.has(playerId)||blockedIds.has(playerId)||
         !p||norm(p.team)!==team.abbr||norm(athlete?.displayName||athlete?.fullName)!==norm(p.name))continue;
      found.push({playerId,name:p.name,team:p.team,position:p.position,
        status:"CONFIRMED_STARTER",source:"ESPN selected-game roster explicit starter flag",
        kind:"STRUCTURED",checkedAt:observedAt,
        evidenceKind:"EXPLICIT_GAME_STARTER_FLAG"});
    }
  }
  const duplicate=new Set();
  const seen=new Set();
  const qbTeams=new Map();
  for(const s of found){
    if(seen.has(s.playerId))duplicate.add(s.playerId);
    seen.add(s.playerId);
    if(String(s.position||"").toUpperCase()==="QB"){
      const players=qbTeams.get(s.team)||new Set();
      players.add(s.playerId);qbTeams.set(s.team,players);
    }
  }
  return found.filter(s=>!duplicate.has(s.playerId)&&
    !(String(s.position||"").toUpperCase()==="QB"&&
      (qbTeams.get(s.team)?.size||0)>1));
}
