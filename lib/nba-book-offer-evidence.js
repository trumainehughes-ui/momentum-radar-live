// Strict evidence gate for direct DraftKings/FanDuel NBA offers.
// Input must originate from an independently observed official book market;
// this module validates records, never scrapes or manufactures them.
const official={DraftKings:/^https:\/\/([a-z0-9-]+\.)*draftkings\.com\//i,
 FanDuel:/^https:\/\/([a-z0-9-]+\.)*fanduel\.com\//i};
const categories=new Set(['points','rebounds','assists','threes','pra']);
const str=x=>typeof x==='string'?x.trim():'';
const number=x=>typeof x==='number'&&Number.isFinite(x)?x:NaN;
export function validateNbaBookOffer(offer,{gameId,now=Date.now(),maxAgeMinutes=30}={}){
 if(!offer||typeof offer!=='object')return {ok:false,reason:'missing_offer'};
 const book=str(offer.book),sourceUrl=str(offer.sourceUrl);
 if(!official[book]||!official[book].test(sourceUrl))return {ok:false,reason:'untrusted_book_source'};
 if(!str(offer.gameId)||gameId&&offer.gameId!==gameId)return {ok:false,reason:'game_identity_mismatch'};
 if(!str(offer.playerId)||!str(offer.player)||!categories.has(str(offer.market)))
  return {ok:false,reason:'player_market_identity_missing'};
 if(!(number(offer.exactLine)>0)||!Number.isInteger(offer.americanOdds)||
    Math.abs(offer.americanOdds)<100)return {ok:false,reason:'invalid_offered_line_or_price'};
 if(!str(offer.selectionId))return {ok:false,reason:'missing_book_selection_id'};
 const observed=Date.parse(offer.observedAt);
 if(!Number.isFinite(observed)||observed>now+60000||now-observed>maxAgeMinutes*60000)
  return {ok:false,reason:'stale_or_invalid_observation'};
 return {ok:true,offer:{gameId:offer.gameId,playerId:offer.playerId,player:offer.player,
  market:offer.market,exactLine:offer.exactLine,americanOdds:offer.americanOdds,
  selectionId:offer.selectionId,book,sourceUrl,observedAt:offer.observedAt}};
}
export function auditNbaBookOffers(offers,options={}){
 const accepted=[],rejected=[];
 for(const offer of Array.isArray(offers)?offers:[]){
  const result=validateNbaBookOffer(offer,options);
  if(result.ok)accepted.push(result.offer);
  else rejected.push({reason:result.reason});
 }
 return {accepted,rejected,verifiedCount:accepted.length,sourcePolicy:'DIRECT_OFFICIAL_SPORTSBOOK_WEBSITE_FIRST'};
}
