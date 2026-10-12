// Redact provider-native quote instructions from a browser-facing NFL market
// response AFTER the signed quote attempts are finished. The internal payload
// is still used intact for exact same-book, same-event price verification.
// Removing a private field never converts an unquoted candidate into a quote.
const INTERNAL_FIELDS=new Set([
 'quoteRequest','bookOutcomeId','book_outcome_id','providerEventId',
 'providerSelectionId','selectionId','outcomeId',
 'outcomeName','outcomeDescription'
]);

export function nflPublicMarketResponse(value){
 const seen=new WeakMap();
 function clean(node){
  if(node===null||typeof node!=='object')return node;
  if(seen.has(node))return seen.get(node);
  if(Array.isArray(node)){
   const out=[];seen.set(node,out);
   for(const item of node)out.push(clean(item));
   return out;
  }
  // These objects normally come from JSON market feeds. Preserve non-plain
  // types (such as Dates) so their standard serialization remains unchanged.
  const proto=Object.getPrototypeOf(node);
  if(proto!==Object.prototype&&proto!==null)return node;
  const out={};seen.set(node,out);
  for(const [key,entry] of Object.entries(node)){
   if(INTERNAL_FIELDS.has(key))continue;
   Object.defineProperty(out,key,{value:clean(entry),enumerable:true,
    writable:true,configurable:true});
  }
  return out;
 }
 return clean(value);
}
