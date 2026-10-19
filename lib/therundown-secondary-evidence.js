// Shared evidence policy for supplemental sportsbook data.
// TheRundown supplies game-level context, never an authenticated correlated SGP quote.
export const SUPPLEMENTAL_SOURCES=Object.freeze(['TheRundown']);
export function supplementalGameEvidence(input={},sport='nfl'){
 const s=String(sport).toLowerCase();
 if(!['nfl','nba'].includes(s))throw Error('unsupported_sport');
 const rows=Array.isArray(input)?input:Array.isArray(input?.data)?input.data:[];
 return {sport:s,source:'TheRundown',role:'SECONDARY_MATCHUP_CONTEXT',
  receivedAt:new Date().toISOString(),
  games:rows.map(e=>({
   eventId:String(e.event_id||e.id||''),
   home:String(e.home_team||e.home?.name||''),
   away:String(e.away_team||e.away?.name||''),
   startsAt:e.start_time||e.commence_time||null
  })).filter(e=>e.eventId&&e.home&&e.away),
  playerPropOffers:[],combinedSgpQuotes:[],
  combinedBookQuoteVerified:false,publishable:false};
}
export function canPublishBookSgp(quote,{now=Date.now()}={}){
 if(!quote||!['DraftKings','FanDuel'].includes(quote.book))return false;
 if(quote.combinedBookQuoteVerified!==true||quote.tierVerified!==true||quote.publishable!==true)return false;
 if(!Number.isFinite(Number(quote.actualSgpOdds))||Number(quote.actualSgpOdds)<=0)return false;
 if(!Array.isArray(quote.legs)||!quote.legs.length)return false;
 if(!quote.quotedAt||!Number.isFinite(Date.parse(quote.quotedAt)))return false;
 if(!Number.isFinite(now)||now-Date.parse(quote.quotedAt)>15*60*1000||Date.parse(quote.quotedAt)>now+60000)return false;
 if(quote.legs.some(l=>!l.bookOffer||l.bookOffer.verified!==true))return false;
 return true;
}
