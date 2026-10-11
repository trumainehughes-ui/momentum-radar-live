// ESPN /teams/{abbr}/roster currently has both position-grouped and
// flat layouts depending on endpoint/version. Preserve athlete identity
// rather than interpreting an empty items[] layout as an empty NFL roster.
export function nflCurrentRosterAthletes(payload){
 const roots=Array.isArray(payload?.athletes)?payload.athletes:
  Array.isArray(payload?.team?.athletes)?payload.team.athletes:
  Array.isArray(payload?.team?.roster?.athletes)?payload.team.roster.athletes:
  Array.isArray(payload?.roster?.athletes)?payload.roster.athletes:
  Array.isArray(payload?.items)?payload.items:[];
 const items=roots.flatMap(group=>{
  if(Array.isArray(group?.items))return group.items;
  if(Array.isArray(group?.athletes))return group.athletes;
  if(Array.isArray(group?.positions))return group.positions.flatMap(p=>p?.items||p?.athletes||[]);
  return(group?.id||group?.athlete?.id)?[group]:[];
 });
 const byId=new Map();
 for(const item of items){
  const a=item?.athlete||item,id=String(a?.id||''),
   name=String(a?.displayName||a?.fullName||a?.name||'').trim(),
   position=a?.position?.abbreviation||item?.position?.abbreviation||null;
  if(!/^\d{3,16}$/.test(id)||!name)continue;
  byId.set(id,{id,name,position});
 }
 return [...byId.values()];
}
