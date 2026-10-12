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
  const category=String(group?.name||group?.displayName||group?.position?.name||
   group?.position?.displayName||group?.group||'');
  const attach=(items,label)=>items.map(item=>({item,rosterGroup:label}));
  if(Array.isArray(group?.items))return attach(group.items,category);
  if(Array.isArray(group?.athletes))return attach(group.athletes,category);
  if(Array.isArray(group?.positions))return group.positions.flatMap(p=>
   attach(p?.items||p?.athletes||[],String(p?.name||p?.displayName||category)));
  return(group?.id||group?.athlete?.id)?attach([group],category):[];
 });
 const byId=new Map();
 for(const wrapped of items){
  const item=wrapped.item,a=item?.athlete||item,id=String(a?.id||''),
   name=String(a?.displayName||a?.fullName||a?.name||'').trim(),
   position=a?.position?.abbreviation||item?.position?.abbreviation||null,
   rosterStatus=String(a?.status?.name||a?.status?.type||a?.status?.description||
     a?.status||item?.status?.name||item?.status||'').slice(0,90);
  if(!/^\d{3,16}$/.test(id)||!name)continue;
  byId.set(id,{id,name,position,rosterGroup:wrapped.rosterGroup,rosterStatus});
 }
 return [...byId.values()];
}
