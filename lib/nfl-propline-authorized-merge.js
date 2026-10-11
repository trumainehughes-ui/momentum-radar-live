// Pure NFL market-source handoff for verified injury-change refreshes.
// PropLine provides provider-native selection IDs required for an authenticated
// combined quote; Odds API / SportsGameOdds market IDs are not interchangeable.
// Ordinary user reads and cron builds do not call PropLine.
export function mergeAuthorizedPropLineRows(current,providerRows){
 const existing=Array.isArray(current)?current:[];
 const signed=Array.isArray(providerRows)?providerRows.filter(x=>
  x?.provider==='PropLine'&&Array.isArray(x.books)&&x.books.some(b=>
   b?.sourceProvider==='PropLine'&&
   (b.book==='DraftKings'||b.book==='FanDuel'))):[];
 return signed.length?[...signed,...existing]:existing;
}
export function nflAuthorizedBookSgpRows(eligibleRows,{authorizedChange=false,
 signedSelectionRows=0}={}){
 const rows=Array.isArray(eligibleRows)?eligibleRows:[];
 // Build correlated-quote candidates solely from real provider-native
 // selections on an authorized change. Generic odds still inform the model.
 if(authorizedChange&&signedSelectionRows>0)
  return rows.filter(x=>x?.provider==='PropLine'&&
   x.books?.some(b=>b?.sourceProvider==='PropLine'));
 return rows;
}
