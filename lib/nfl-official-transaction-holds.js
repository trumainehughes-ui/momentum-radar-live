// Independently verified NFL team transaction holds. ESPN's game injury
// report often omits players on season/game-long reserve lists; those players
// must not become playable picks from old box scores or ESPN roster listings.
//
// These entries are scoped to the precise game and expire afterwards. An
// official ACTIVE transaction can supersede one only after independent review,
// never merely because a past-season/ESPN roster still lists the athlete.
const HOLDS=Object.freeze([
 Object.freeze({
  dateFrom:'2026-10-19',team:'NE',playerId:'4361432',name:'Romeo Doubs',
  status:'IR',effectiveAt:'2026-10-19',
  source:'NEW_ENGLAND_PATRIOTS_OFFICIAL_TRANSACTIONS',
  sourceUrl:'https://www.patriots.com/team/transactions/2026',
  reason:'Patriots placed Romeo Doubs on injured reserve October 19, 2026'
 }),
 Object.freeze({
  dateFrom:'2026-10-10',team:'NE',playerId:'2991662',name:'Mack Hollins',
  status:'IR',effectiveAt:'2026-10-10',
  source:'NEW_ENGLAND_PATRIOTS_OFFICIAL_TRANSACTIONS',
  sourceUrl:'https://www.patriots.com/team/transactions/2026',
  reason:'Patriots placed Mack Hollins on injured reserve October 10, 2026'
 }),
 Object.freeze({
  // The official September 26 team transaction is valid until a newer
  // independent activation is confirmed. Historic box scores cannot clear IR.
  dateFrom:'2026-09-26',team:'SF',playerId:'3043116',name:'Demarcus Robinson',
  status:'IR',effectiveAt:'2026-09-26',
  source:'SAN_FRANCISCO_49ERS_OFFICIAL_TRANSACTIONS',
  sourceUrl:'https://www.49ers.com/news/49ers-make-a-series-of-roster-moves-ahead-of-azvssf',
  reason:'49ers placed Demarcus Robinson on injured reserve September 26, 2026'
 }),
 Object.freeze({
  // IR placement remains active across games; prior game-only scoping
  // incorrectly released him into Rams/Arizona model SGPs on Oct 18.
  // Never assume automatic activation after the minimum IR period.
  dateFrom:'2026-10-02',team:'LAR',
  playerId:'4570037',name:'Terrance Ferguson',status:'IR',
  effectiveAt:'2026-10-02',source:'LOS_ANGELES_RAMS_OFFICIAL_TRANSACTIONS',
  sourceUrl:'https://www.therams.com/team/transactions/',
  reason:'Rams placed TE Terrance Ferguson on Reserve/Injured Oct 2, 2026'
 }),
 Object.freeze({
  // The mandatory four-game absence is a MINIMUM, not an activation date.
  // This IR hold continues until a newer verified official activation is
  // recorded, even if a historical ESPN roster still lists him.
  dateFrom:'2026-10-03',team:'SEA',
  playerId:'4685512',name:'Jadarian Price',status:'IR',
  effectiveAt:'2026-10-03',source:'SEATTLE_SEAHAWKS_OFFICIAL_TRANSACTIONS',
  sourceUrl:'https://www.seahawks.com/news/seahawks-make-roster-moves-ahead-of-week-4-game-vs-chargers',
  reason:'Seahawks placed RB Jadarian Price on injured reserve Oct 3, 2026 (minimum four games)'
 })
]);
const norm=x=>String(x??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function nflOfficialTransactionHolds({gameId,date,home,away}={}){
 const teams=new Set([norm(home),norm(away)]);
 return HOLDS.filter(x=>{
  const matchedGame=x.gameId?
   String(x.gameId)===String(gameId)&&String(x.date)===String(date):
   /^\d{4}-\d{2}-\d{2}$/.test(String(date||''))&&
    String(date)>=String(x.dateFrom)&&
     (!x.dateThrough||String(date)<=String(x.dateThrough));
  return matchedGame&&teams.has(norm(x.team));
 })
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
