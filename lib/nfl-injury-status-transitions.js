// Pure, fail-closed comparison of the current and previously observed ESPN
// NFL game injury rows. A new officially listed absence matters even when the
// athlete was not named in the prior report. Absence from the injury feed is
// NOT proof that a player is cleared to play.
const definitiveAbsence=state=>/\b(?:out|inactive|injured reserve|ir|pup|nfi|suspended)\b/i
 .test(String(state||''));
const validPlayer=p=>Boolean(p&&/^\d{4,15}$/.test(String(p.id||''))&&
 String(p.name||'').trim()&&String(p.team||'').trim()&&
 String(p.status||'').trim()&&String(p.status).toLowerCase()!=='unknown');

export function verifiedNflInjuryTransitions(previous,current,{
 gameId,observedAt=new Date().toISOString()
}={}){
 if(!Array.isArray(previous)||!Array.isArray(current)||
    !/^\d{8,12}$/.test(String(gameId||'')))return [];
 const known=new Map(previous.filter(validPlayer).map(p=>[String(p.id),p]));
 const emitted=new Set(),changes=[];
 for(const player of current){
  if(!validPlayer(player)||emitted.has(String(player.id)))continue;
  const old=known.get(String(player.id));
  const currentStatus=String(player.status).trim().toLowerCase(),
   oldStatus=String(old?.status||'').trim().toLowerCase();
  if(old&&String(old.team)!==String(player.team))continue;
  // An unreported-to-QUESTIONABLE transition is not confirmed inactive;
  // reserve paid sportsbook checks for confirmed absence or changes to an
  // already listed athlete's injury status.
  if(!old&&!definitiveAbsence(currentStatus))continue;
  if(old&&oldStatus===currentStatus)continue;
  emitted.add(String(player.id));
  changes.push({
   type:definitiveAbsence(currentStatus)?'player_inactive':'player_injury',
   gameId:String(gameId),playerId:String(player.id),playerName:player.name,
   position:player.position||null,unit:'offense_or_defense',
   before:old?oldStatus:'NOT_PREVIOUSLY_REPORTED',after:currentStatus,
   source:'ESPN NFL injury summary',observedAt
  });
 }
 return changes;
}
