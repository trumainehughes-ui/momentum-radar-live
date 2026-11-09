// Preserve source order within each group; process the requested defense first.
export function prioritizeOpponentEvents(events,opponentId,limit=16){
 const seen=new Set(),unique=[];
 for(const event of Array.isArray(events)?events:[]){
  const id=String(event?.id??'');
  if(!id||seen.has(id))continue;
  seen.add(id);unique.push(event);
 }
 const matches=e=>(e.competitions?.[0]?.competitors||[]).some(c=>String(c?.team?.id??'')===String(opponentId));
 const selected=[...unique.filter(matches),...unique.filter(e=>!matches(e))].slice(0,limit);
 return {events:selected,eventsOmitted:Math.max(0,unique.length-selected.length),opponentGamesSelected:selected.filter(matches).length};
}
