/** Pure, dependency-free betting math for verified single-market prices.
 * Research utility only: no sportsbook feeds or SGP quote construction. */
export function impliedProbability(americanOdds){
 if(!Number.isInteger(americanOdds)||Math.abs(americanOdds)<100)return null;
 return americanOdds>0?100/(americanOdds+100):(-americanOdds)/((-americanOdds)+100);
}
export function decimalOdds(americanOdds){
 if(impliedProbability(americanOdds)===null)return null;
 return americanOdds>0?1+americanOdds/100:1+100/(-americanOdds);
}
export function expectedValue({modelProbability,americanOdds}={}){
 const decimal=decimalOdds(americanOdds);
 if(decimal===null||!Number.isFinite(modelProbability)||modelProbability<0||modelProbability>1)return null;
 return modelProbability*(decimal-1)-(1-modelProbability);
}
export function conservativeKelly({modelProbability,americanOdds,fraction=0.25}={}){
 const decimal=decimalOdds(americanOdds);
 if(decimal===null||!Number.isFinite(modelProbability)||modelProbability<0||modelProbability>1||!Number.isFinite(fraction)||fraction<0||fraction>1)return null;
 const b=decimal-1;
 return Math.max(0,Math.min(1,((b*modelProbability)-(1-modelProbability))/b*fraction));
}
export function noVigTwoWay(oddsA,oddsB){
 const a=impliedProbability(oddsA),b=impliedProbability(oddsB);
 if(a===null||b===null)return null;
 const total=a+b;
 return {a:a/total,b:b/total,overround:total-1};
}
/** A single-book quote must be independently attested; never multiply SGP legs. */
export function assessSinglePropValue({modelProbability,americanOdds,book,selectionId,marketId,eventId,fetchedAt,now=Date.now(),maxAgeMs=15*60_000}={}){
 const age=now-Date.parse(fetchedAt);
 if(!['DraftKings','FanDuel'].includes(book)||![selectionId,marketId,eventId].every(x=>typeof x==='string'&&x.trim())||!Number.isFinite(age)||age<0||age>maxAgeMs)return null;
 const ev=expectedValue({modelProbability,americanOdds});
 if(ev===null)return null;
 return {book,selectionId,marketId,eventId,impliedProbability:impliedProbability(americanOdds),expectedReturnPerDollar:ev,quarterKelly:conservativeKelly({modelProbability,americanOdds}),isSGPQuote:false};
}
