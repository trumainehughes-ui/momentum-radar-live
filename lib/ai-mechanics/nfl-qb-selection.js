// The ESPN analytics boards are shared between requests. QB1 selection must
// be a pure per-game view; never annotate or mutate the cached season rows.
// If an independently verified starting QB is known on this team, exclude a
// different player ID from that team's passing board for this request only.
const norm=x=>String(x??"").toUpperCase().replace(/[^A-Z0-9]/g,"");

export function isBackupQbForVerifiedGame(row,roleGate){
  if(!roleGate?.checked||!row||
     norm(row.position)!=="QB"||!row.playerID||!row.team)return false;
  const matched=Array.isArray(roleGate.players)?roleGate.players.filter(p=>
    norm(p?.position)==="QB"&&norm(p?.team)===norm(row.team)&&
    p?.starterVerified===true&&p?.recommendationEligible===true&&
    p?.verification?.role?.verified===true):[];
  // Unverified, duplicate or conflicting source claims are not enough to
  // identify a backup. Starter verification remains a separate release gate.
  if(matched.length!==1)return false;
  return String(matched[0].playerId)!==String(row.playerID);
}
