/** SharpAPI secondary research feed. Never certifies a first-party offer or SGP quote. */
const finite = v => v === null || v === undefined || v === '' ? NaN : Number(v);
const validBook = b => ['draftkings','fanduel'].includes(String(b||'').toLowerCase());
const isProp = m => /player|passing|rushing|receiving|receptions|touchdown|points|rebounds|assists|three.point/i.test(String(m||''));
export function normalizeSharpApiOdds(rows,{now=Date.now(),maxAgeMs=15*60_000}={}){
 if(!Array.isArray(rows))return [];
 return rows.flatMap(row=>{
  const book=String(row?.sportsbook||'').toLowerCase();
  const at=Date.parse(row?.timestamp);
  const price=finite(row?.odds_american);
  const line=finite(row?.line);
  const eventId=String(row?.event_id||'').trim();
  const player=String(row?.selection||'').trim();
  const side=String(row?.selection_type||'').toLowerCase();
  const market=String(row?.market_type||'').trim();
  if(!validBook(book)||!isProp(market)||!eventId||!player||
    !['over','under'].includes(side)||!Number.isFinite(line)||
    !Number.isInteger(price)||Math.abs(price)<100||
    !Number.isFinite(at)||at>now||now-at>maxAgeMs)return [];
  return [{
   provider:'SharpAPI',sourceTier:'secondary',book,eventId,player,
   market,side,line,americanOdds:price,observedAt:row.timestamp,
   firstPartyVerified:false,verifiedSGPQuote:false,bookmakerIssuedQuote:false,
   eligibleForPublicBettableSlip:false
  }];
 });
}
export function sharpApiResearchMatch(secondary,firstParty){
 if(!secondary||!firstParty||firstParty.firstPartyVerified!==true)return false;
 return String(secondary.book).toLowerCase()===String(firstParty.book).toLowerCase()&&
   secondary.eventId===firstParty.eventId&&
   secondary.player.trim().toLowerCase()===String(firstParty.player||'').trim().toLowerCase()&&
   secondary.market===firstParty.market&&secondary.side===firstParty.side&&
   secondary.line===firstParty.line;
}
