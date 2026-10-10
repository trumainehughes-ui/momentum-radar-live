// Optional authenticated sportsbook adapter boundary. Do NOT call this with browser claims,
// AI prose, ESPN injury statuses, inferred DNP, or multiplied individual-leg prices.
const BOOKS=new Set(['DraftKings','FanDuel']);
const STATES=new Set(['VOID','LOST','WON','OPEN']);
const str=v=>String(v??'').trim();
const goodAmerican=v=>Number.isSafeInteger(v)&&v!==0&&(v>=100||v<=-100);
const pending=(reason)=>({verified:false,reason,status:'BOOK_SETTLEMENT_PENDING',
  adjustedAmericanOdds:null,netProfit:null,totalReturn:null});
export function reconcileNflBookTicket(ticket,event,{providerAuthenticated=false}={}){
 if(!providerAuthenticated)return pending('AUTHENTICATED_BOOK_SESSION_REQUIRED');
 if(!ticket||ticket.kind!=='PLACED_BOOK'||!BOOKS.has(ticket.book)||!str(ticket.ticketId)||
    !/^\d{7,12}$/.test(str(ticket.gameId)))return pending('BOOK_TICKET_IDENTITY_INVALID');
 if(!event||event.sourceType!=='BOOK_ISSUED_SETTLEMENT'||event.book!==ticket.book||
    str(event.ticketId)!==str(ticket.ticketId)||str(event.gameId)!==str(ticket.gameId))
  return pending('BOOK_SETTLEMENT_IDENTITY_MISMATCH');
 const legs=Array.isArray(ticket.legs)?ticket.legs:[];
 const settlements=Array.isArray(event.legs)?event.legs:[];
 if(!legs.length||legs.some(x=>!str(x.providerLegId)))return pending('ORIGINAL_BOOK_LEG_IDS_REQUIRED');
 const seen=new Set(),eventByLeg=new Map();
 for(const row of settlements){
  const id=str(row.providerLegId);
  if(!id||seen.has(id)||!STATES.has(row.outcome))return pending('INVALID_BOOK_LEG_SETTLEMENT');
  seen.add(id);eventByLeg.set(id,row.outcome);
 }
 if(settlements.length!==legs.length||eventByLeg.size!==legs.length||
    legs.some(x=>!eventByLeg.has(str(x.providerLegId))))
  return pending('BOOK_LEGS_INCOMPLETE_OR_MISMATCHED');
 const settled=legs.map(x=>({...x,outcome:eventByLeg.get(str(x.providerLegId))}));
 const voided=settled.filter(x=>x.outcome==='VOID');
 const remaining=settled.filter(x=>x.outcome!=='VOID');
 const loss=remaining.some(x=>x.outcome==='LOST');
 const final=remaining.every(x=>x.outcome==='WON')&&remaining.length>0;
 const out={verified:true,book:ticket.book,ticketId:ticket.ticketId,gameId:ticket.gameId,
  legs:settled,voidedCount:voided.length,actualBookSettlement:true,
  adjustedAmericanOdds:null,netProfit:null,totalReturn:null,sourceType:event.sourceType};
 if(!remaining.length)return {...out,status:'BOOK_TICKET_VOID'};
 if(loss)return {...out,status:'BOOK_TICKET_LOST'};
 if(voided.length){
  // SGP correlation means surviving individual-leg odds cannot determine the revised price.
  // A trusted, book-issued FULL surviving combination quote is required.
  const quote=event.adjustedQuote;
  const ids=remaining.map(x=>str(x.providerLegId)).sort();
  const quoted=Array.isArray(quote?.remainingLegIds)?quote.remainingLegIds.map(str).sort():[];
  if(quote?.sourceType!=='BOOK_ISSUED_ADJUSTED_SGP'||
      quote?.book!==ticket.book||str(quote.ticketId)!==str(ticket.ticketId)||
      !goodAmerican(quote.americanOdds)||JSON.stringify(ids)!==JSON.stringify(quoted))
   return {...out,status:'BOOK_ADJUSTED_ODDS_PENDING'};
  const odds=quote.americanOdds,stake=Number(ticket.stake);
  const totalReturn=Number.isFinite(stake)&&stake>0?
     Math.round((odds>0?stake*(1+odds/100):stake*(1+100/Math.abs(odds)))*100)/100:null;
  const netProfit=totalReturn===null?null:Math.round((totalReturn-stake)*100)/100;
  return {...out,status:final?'BOOK_REPRICED_SETTLED':'BOOK_REPRICED_OPEN',
    adjustedAmericanOdds:odds,netProfit:final?netProfit:null,
    totalReturn:final?totalReturn:null};
 }
 return {...out,status:final?'BOOK_TICKET_WON':'BOOK_TICKET_OPEN'};
}
