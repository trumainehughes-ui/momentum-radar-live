// Mandatory sportsbook sourcing policy for NFL, NBA and future supported leagues.
// Public availability does not authorize bypassing access controls or inventing prices.
export const REQUIRED_SPORTSBOOKS=Object.freeze(['DraftKings','FanDuel']);
export const REQUIRED_MARKET_CATEGORIES=Object.freeze({
 nfl:['td','passing','rushing','receiving','receptions'],
 nba:['points','rebounds','assists','threes','pra']
});
export const SPORTSBOOK_REFRESH_POLICY=Object.freeze({
 dayAhead:true,finalPregameMinutes:30,scheduledRefreshMinutes:15,
 sportsbookSourcesRequired:true,allowUnverifiedPrices:false,
 allowSyntheticCombinedSgpOdds:false,aiMayInventMarketData:false
});
export function sportsbookCoverageAudit({sport,gameId,offers=[],attempts=[]}={}){
 const league=String(sport||'').toLowerCase();
 const requiredCategories=REQUIRED_MARKET_CATEGORIES[league]||[];
 const books=REQUIRED_SPORTSBOOKS.map(book=>{
  const attempt=attempts.find(x=>x.book===book)||null;
  const rows=offers.filter(x=>x.book===book&&x.gameId===gameId);
  const availableCategories=requiredCategories.filter(market=>rows.some(x=>x.market===market));
  return {book,attempted:Boolean(attempt),status:attempt?.status||'NOT_ATTEMPTED',
   observedOffers:rows.length,availableCategories,
   missingCategories:requiredCategories.filter(x=>!availableCategories.includes(x)),
   reason:attempt?.reason||(!attempt?'source_not_checked':null)};
 });
 return {sport:league,gameId,requiredBooks:REQUIRED_SPORTSBOOKS,
  books,allSourcesAttempted:books.every(x=>x.attempted),
  fullCategoryCoverage:books.every(x=>x.missingCategories.length===0),
  noInventedOdds:true};
}
