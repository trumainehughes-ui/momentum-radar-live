// Keep the server's verified model tier-composition contract in every
// owner/public snapshot. Model targets are deliberately *not* sportsbook
// selections, and this serializer never creates a quoted SGP.
import {NFL_SGP_TIERS} from './ai-mechanics/nfl-sgp-tiers.js';
const known=new Set(['td','passing','rushing','receiving','receptions']);
export function publishedNflModelTier(card){
 const risk=String(card?.risk||''),tier=NFL_SGP_TIERS[risk];
 const source=Array.isArray(card?.legs)?card.legs:[];
 const count=Number(card?.requiredLegs);
 if(!tier||card?.tierAssessment?.compositionOk!==true||
  !Number.isSafeInteger(count)||count!==source.length||
  count<tier.minLegs||count>tier.maxLegs)return null;
 const legs=source.map(x=>{
  const player=String(x?.name||'').trim().slice(0,90);
  const team=String(x?.team||'').toUpperCase().trim();
  const category=String(x?.cat||x?.category||'').toLowerCase();
  const gameId=String(x?.eventID||x?.gameId||'');
  if(!player||!/^\d{7,12}$/.test(gameId)||
    !/^[A-Z]{2,4}$/.test(team)||!known.has(category))return null;
  return {player,team,category,gameId,target:null,
   marketSelectionStatus:'NO_EXACT_DRAFTKINGS_OR_FANDUEL_OFFER'};
 });
 if(legs.some(x=>!x))return null;
 return{risk,mode:'MODEL_ONLY',publishable:false,
  combinedBookQuoteVerified:false,actualSgpOdds:null,
  requiredLegs:count,
  tierAssessment:{compositionOk:true,status:'COMBINED_PRICE_UNVERIFIED'},
  explanation:String(card.explanation?.summary||card.reason||'').slice(0,250),
  legs};
}
