// A partial injury feed can still contain authoritative OUT/QUESTIONABLE
// exclusions. Never throw that evidence away just because both teams were
// not fully checked. This protects model-only boards as well as book picks.
const norm=x=>String(x??"").toUpperCase().replace(/[^A-Z0-9]/g,"");
const toSet=value=>value instanceof Set ? value : new Set();

export function isKnownNflIneligible(player, evidence={}) {
  if (!player || typeof player!=="object") return true;
  const id=String(player.playerID??player.playerId??"");
  const name=norm(player.name??player.playerName);
  const excludedIds=toSet(evidence.blockedIds);
  const excludedNames=toSet(evidence.blockedNames);
  const questionableIds=toSet(evidence.questionableIds);
  const questionableNames=toSet(evidence.questionableNames);
  if((id&&(excludedIds.has(id)||questionableIds.has(id)))||
     (name&&(excludedNames.has(name)||questionableNames.has(name))))
    return true;
  const state=norm(player.injuryStatus??player.availability??player.status);
  return ["OUT","DOUBTFUL","INACTIVE","IR","INJUREDRESERVE",
    "QUESTIONABLE","SUSPENDED","SUSPENSION","PUP","NFI"].includes(state);
}
export function filterKnownNflIneligibleRows(rows,evidence={}){
  if(!Array.isArray(rows))return [];
  return rows.filter(x=>!isKnownNflIneligible(x,evidence));
}
