// Independently verified NFL team transaction holds. ESPN's game injury
// report often omits players on season/game-long reserve lists; those players
// must not become playable picks from old box scores or ESPN roster listings.
//
// These entries are scoped to the precise game and expire afterwards. An
// official ACTIVE transaction can supersede one only after independent review,
// never merely because a past-season/ESPN roster still lists the athlete.
const HOLDS=Object.freeze([
 Object.freeze({
  gameId:'401872994',date:'2026-10-12',team:'LAR',
  playerId:'4570037',name:'Terrance Ferguson',status:'IR',
  effectiveAt:'2026-10-02',source:'LOS_ANGELES_RAMS_OFFICIAL_TRANSACTIONS',
  sourceUrl:'https://www.therams.com/team/transactions/',
  reason:'Rams placed TE Terrance Ferguson on Reserve/Injured Oct 2, 2026'
 })
]);
const norm=x=>String(x??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function nflOfficialTransactionHolds({gameId,date,home,away}={}){
 const teams=new Set([norm(home),norm(away)]);
 return HOLDS.filter(x=>String(x.gameId)===String(gameId)&&
  String(x.date)===String(date)&&teams.has(norm(x.team)))
  .map(x=>({...x}));
}
export function nflRosterReserveHold(x){
 const status=String(x?.rosterStatus||x?.status||'').toUpperCase();
 const section=String(x?.rosterGroup||x?.rosterSection||'').toUpperCase();
 return /\b(?:INJURED RESERVE|RESERVE.INJURED|INACTIVE|PUP|NFI|SUSPENDED|IR)\b/.test(status+' '+section);
}
export function nflOfficialHoldMatches(player,hold){
 if(!hold||!player||norm(player.team)!==norm(hold.team))return false;
 const id=String(player.playerID||player.playerId||'');
 if(id&&id===String(hold.playerId))return true;
 return norm(player.name)===norm(hold.name);
}
