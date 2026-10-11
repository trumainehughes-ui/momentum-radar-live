// Pure fail-closed preflight for a PropLine correlated book quote.
// Individual selections must come from the SAME upstream book, event and
// current 15-minute odds snapshot. Odds API / SportsGameOdds lines are useful
// analytics inputs but have NO interchangeable PropLine book selection ids.
const BOOKS={DraftKings:'draftkings',FanDuel:'fanduel'};
const RISK_COUNTS={Small:[4,4],Medium:[5,5],Nuke:[5,7]};
const MARKETS=new Set(['player_pass_yds','player_rush_yds',
 'player_reception_yds','player_receptions','player_anytime_td']);

export function evaluateNflBookQuoteReadiness(card,{
 book,gameId,now=Date.now()
}={}){
 const blocked=reason=>({eligible:false,reason,eventId:null,
  selections:[],selectionCount:0,quoteRequest:null});
 const bookmaker=BOOKS[book],risk=String(card?.risk||'');
 if(!bookmaker||!/^[0-9]{7,12}$/.test(String(gameId||''))||
   !RISK_COUNTS[risk])return blocked('INVALID_QUOTE_GAME_OR_TIER');
 const legs=Array.isArray(card?.legs)?card.legs:[];
 const [min,max]=RISK_COUNTS[risk];
 if(card?.tierAssessment?.compositionOk!==true||
   legs.length<min||legs.length>max||
   !Number.isSafeInteger(card.requiredLegs)||card.requiredLegs!==legs.length)
  return blocked('INCOMPLETE_OR_UNQUALIFIED_BOOK_TIER');
 const selections=[],events=new Set(),uniqueIds=new Set();
 for(const leg of legs){
  const offer=leg?.bookOffer;
  if(!offer||offer.book!==book||offer.available!==true||
    offer.sourceProvider!=='PropLine')
   return blocked('MISSING_PROPLINE_BOOK_OFFER');
  if(String(leg?.eventID||leg?.gameId||'')!==String(gameId))
   return blocked('CROSS_GAME_BOOK_SELECTIONS');
  const market=String(offer.marketKey||'').trim(),
   id=String(offer.bookOutcomeId??'').trim();
  if(!MARKETS.has(market)||id.length<3||id.length>160)
   return blocked('MISSING_VERIFIED_BOOK_SELECTIONS');
  const sourceEvent=String(leg?.providerEventId||'').trim();
  if(!/^[0-9]{1,14}$/.test(sourceEvent))
   return blocked('MISSING_PROVIDER_EVENT_ID');
  events.add(sourceEvent);
  const at=Date.parse(String(offer.checkedAt||leg.checkedAt||''));
  if(!Number.isFinite(now)||!Number.isFinite(at)||
    at>now+60_000||now-at>15*60_000)
   return blocked('STALE_OR_UNDATED_BOOK_SELECTION');
  if(!Number.isFinite(Number(offer.odds))||Number(offer.odds)===0)
   return blocked('MISSING_BOOK_OFFER_PRICE');
  const key=market+'|'+id;
  if(uniqueIds.has(key))return blocked('DUPLICATE_BOOK_SELECTION');
  uniqueIds.add(key);
  selections.push({market,book_outcome_id:id});
 }
 if(events.size!==1)return blocked('CROSS_PROVIDER_EVENT_SELECTIONS');
 const eventId=[...events][0];
 return {eligible:true,reason:'READY_FOR_AUTHORIZED_QUOTE',eventId,
  selections,selectionCount:selections.length,
  quoteRequest:{league:'nfl',gameId:String(gameId),eventId,
   bookmaker,risk,legs:selections}};
}
