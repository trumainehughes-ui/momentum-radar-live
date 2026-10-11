// Read-only correlation of observed public bookmaker prices to MODEL player
// names in exactly one scheduled matchup. This is NOT an authenticated
// sportsbook-market audit, even if team/player names appear to match.
// Preserve the actual sportsbook winning threshold as published.
import {officialSportsbookPublicPage} from './sportsbook-public-links.js';
const clean=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .toUpperCase().replace(/[^A-Z0-9]/g,'');
export function fanduelTeamPublicUrl(teamName){
 const raw=String(teamName||'').trim();
 if(!/^[A-Za-z0-9 .'-]{5,65}$/.test(raw))return null;
 const slug=raw.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 if(!slug)return null;
 const url='https://sportsbook.fanduel.com/teams/nfl/'+slug+'/odds';
 return officialSportsbookPublicPage(url)?.url||null;
}
export function publicMatchupOddsCrosscheck({
 gameId,home,away,sgps,publicReports=[],now=Date.now()
}={}){
 const expected=new Set([fanduelTeamPublicUrl(home?.name),
  fanduelTeamPublicUrl(away?.name)].filter(Boolean));
 const validEvent=/^\d{7,12}$/.test(String(gameId||''))&&expected.size===2;
 const cards=Array.isArray(sgps?.Analytics)?sgps.Analytics:[];
 const players=new Map();
 for(const card of cards)for(const leg of card?.legs||[]){
  if(!leg?.name)continue;
  const key=clean(leg.name);
  if(!key)continue;
  if(!players.has(key))players.set(key,{
   name:String(leg.name).slice(0,80),team:String(leg.team||'').slice(0,12),
   categories:new Set(),tiers:new Set()});
  players.get(key).categories.add(String(leg.cat||leg.category||'').toLowerCase());
  players.get(key).tiers.add(card.risk);
 }
 const observations=[],sourceStates=[];
 for(const source of publicReports.slice(0,3)){
  const page=officialSportsbookPublicPage(source?.url);
  const fromTeam=page?.book==='FanDuel'&&expected.has(page.url);
  const fromDraftKings=page?.book==='DraftKings'&&
   page.pageType==='DRAFTKINGS_PUBLIC_PLAYER_PROPS';
  if(!validEvent||!page||!fromTeam&&!fromDraftKings)continue;
  const checked=Date.parse(source.checkedAt||'');
  const fresh=Number.isFinite(checked)&&checked<=now&&
   now-checked<=15*60*1000&&source.ok===true;
  sourceStates.push({book:page.book,sourceUrl:page.url,
   publicPageFetched:fresh,observedQuotes:fresh?
    (Array.isArray(source.quotes)?source.quotes.length:0):0,
   extractedPricePairsAreCurrentMarketQuotes:false});
  if(!fresh)continue;
  for(const x of (Array.isArray(source.quotes)?source.quotes:[]).slice(0,120)){
   if(x.book!==page.book||x.sourceUrl!==page.url)continue;
   const found=players.get(clean(x.player)),market=String(x.market||'').toLowerCase();
   if(!found||!found.categories.has(market)||!/^[-+]\d{2,6}$/.test(String(x.americanOdds||'')))continue;
   observations.push({
    player:found.name,team:found.team,
    category:market,rawLine:String(x.rawLine||'').slice(0,20),
    americanOdds:String(x.americanOdds),
    book:page.book,
    modelTiers:[...found.tiers].filter(r=>['Small','Medium','Nuke'].includes(r)),
    matchedPlayerAndStat:true,gameEventVerified:false,
    bookSelectionVerified:false,combinedOddsVerified:false,
    sourceUrl:page.url
   });
  }
 }
 return{gameId:String(gameId||''),status:!validEvent?'EVENT_NOT_VERIFIED':
  observations.length?'PUBLIC_PLAYER_STAT_OBSERVATIONS':'NO_MATCHED_PUBLIC_PLAYER_PRICES',
  sources:sourceStates,modelsChecked:cards.length,
  matchedObservations:observations.slice(0,50),
  authenticatedEventAndLineVerification:false,
  canModifySgp:false,canAssignCombinedOdds:false,
  note:'Public observations matched only by displayed player name and stat. Page metadata has no sportsbook event/line ID and may be untimed, so it cannot establish accepted wager availability, replace model legs or validate correlated payout.'};
}
