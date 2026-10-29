// Independently verified NFL team transaction holds. ESPN's game injury
// report often omits players on season/game-long reserve lists; those players
// must not become playable picks from old box scores or ESPN roster listings.
//
// These entries are scoped to the precise game and expire afterwards. An
// official ACTIVE transaction can supersede one only after independent review,
// never merely because a past-season/ESPN roster still lists the athlete.
const HOLDS=Object.freeze([
 Object.freeze({
  // Green Bay confirmed Reed's 2026 neck injury requires season-ending surgery.
  dateFrom:'2026-09-30',team:'GB',playerId:'',name:'Jayden Reed',
  status:'IR',effectiveAt:'2026-09-30',
  source:'GREEN_BAY_PACKERS_OFFICIAL_TRANSACTIONS',
  sourceUrl:'https://www.packers.com/news/packers-sign-g-kevin-zeitler-sept-30-2026',
  reason:'Packers placed Jayden Reed on injured reserve September 30, 2026; season-ending neck injury'
 }),
 Object.freeze({
  // Brooks' September core-muscle surgery has a six-to-eight-week recovery
  // timeline; he was not activated for the October 29 Carolina game.
  dateFrom:'2026-09-23',dateThrough:'2026-10-29',team:'CAR',
  playerId:'',name:'Jonathon Brooks',status:'IR',effectiveAt:'2026-09-23',
  source:'CAROLINA_PANTHERS_OFFICIAL_TRANSACTIONS',
  sourceUrl:'https://www.panthers.com/news/jonathon-brooks-placed-on-injured-reserve-signed-isaiah-simmons',
  reason:'Panthers placed Jonathon Brooks on injured reserve September 23, 2026; no October 29 activation confirmed'
 }),
 Object.freeze({
  // Eagles official Oct 17 roster transaction; weekly game designations
  // omit players already on IR. Do not reuse Hurts' earlier rushing samples.
  dateFrom:'2026-10-17',team:'PHI',playerId:'4040715',
  name:'Jalen Hurts',status:'IR',effectiveAt:'2026-10-17',
  source:'PHILADELPHIA_EAGLES_OFFICIAL_ROSTER_MOVES',
  sourceUrl:'https://www.philadelphiaeagles.com/news/eagles-place-jalen-hurts-on-injured-reserve-sign-jaydon-blue-to-the-active-roster-2026-nfl-week-6-panthers',
  reason:'Eagles placed QB Jalen Hurts on Injured Reserve Oct 17, 2026'
 }),
 Object.freeze({
  dateFrom:'2026-10-16',team:'PHI',playerId:'',
  name:'Will Shipley',status:'IR',effectiveAt:'2026-10-16',
  source:'PHILADELPHIA_EAGLES_OFFICIAL_ROSTER_MOVES',
  sourceUrl:'https://www.philadelphiaeagles.com/news/eagles-place-rb-will-shipley-on-injured-reserve-2026-week-6',
  reason:'Eagles placed RB Will Shipley on Injured Reserve Oct 16, 2026'
 }),
 Object.freeze({
  dateFrom:'2026-10-06',team:'PHI',playerId:'',
  name:'Tank Bigsby',status:'IR',effectiveAt:'2026-10-06',
  source:'PHILADELPHIA_EAGLES_OFFICIAL_ROSTER_MOVES',
  sourceUrl:'https://www.philadelphiaeagles.com/news/eagles-place-rb-tank-bigsby-on-injured-reserve-release-lb-anfernee-orji-from-the-practice-squad',
  reason:'Eagles placed RB Tank Bigsby on Injured Reserve Oct 6, 2026'
 }),
 Object.freeze({
  // Rams confirmed the Oct 20 IR move; the Week 7 injury-report table
  // excludes already-reserved players, so historical box scores alone would
  // otherwise incorrectly keep this receiver in public predictions.
  dateFrom:'2026-10-20',team:'LAR',playerId:'16800',
  name:'Davante Adams',status:'IR',effectiveAt:'2026-10-20',
  source:'LOS_ANGELES_RAMS_OFFICIAL_TRANSACTIONS',
  sourceUrl:'https://www.therams.com/news/rams-sign-kicker-brandon-mcmanus-place-poona-ford-and-davante-adams-on-injured-reserve',
  reason:'Rams placed WR Davante Adams on Injured Reserve October 20, 2026'
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
