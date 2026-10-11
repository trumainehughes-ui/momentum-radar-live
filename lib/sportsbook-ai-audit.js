// Server-produced Sportsbook AI Guardian, generated for EVERY selected NFL/NBA
// event from existing market/SGP audits. Zero Groq, no extra odds-provider calls.
// This is review metadata, not permission to change prices, props or bets.
import {generateAdvisory} from './ai-mechanics/ai-advisors.js';

const RISKS=['Small','Medium','Nuke'],BOOKS=['FanDuel','DraftKings'];
const clamp=x=>String(x??'').slice(0,95);
export function sportsbookAiEvidenceFromSnapshot({
 league,gameId,sgps,sgpVerification,sourceCheckedAt,
 marketFeedAvailable=false
}={}){
 if(!['nfl','nba'].includes(league)||!/^[0-9]{7,12}$/.test(String(gameId||'')))
  return null;
 const cards=league==='nfl'?(sgps?.Analytics||[]):Array.isArray(sgps)?sgps:[];
 const verified=sgpVerification?.league===league&&
   String(sgpVerification?.gameId)===String(gameId);
 return {
  gameId:String(gameId),game:{homeAbbr:null,awayAbbr:null},
  model:{validation:{sportsbookVerificationAvailable:marketFeedAvailable===true}},
  sportsbooks:{gameId:String(gameId),league,
   sourceCheckedAt:sourceCheckedAt||null,marketFeedAvailable:marketFeedAvailable===true,
   combinedSgpQuoteAuthorized:false,
   tiers:RISKS.map(risk=>{
    const card=cards.find(x=>x?.risk===risk),
     sourceTier=verified?sgpVerification.tiers?.find(x=>x?.risk===risk):null;
    return{risk,legCount:Array.isArray(card?.legs)?card.legs.length:0,
     modelStatus:sourceTier?.modelStatus||'NOT_READY',
     books:Object.fromEntries(BOOKS.map(book=>{
      const x=league==='nfl'?card?.bookMarketAudits?.[book]:null,
       valid=x?.book===book&&x?.requestedTier===risk&&
        String(x?.gameId)===String(gameId);
      return[book,valid?{
       status:clamp(x.status),matchedLegs:Number(x.matchedLegs)||0,
       requiredLegs:Number(x.totalLegs)||0,
       missingLegs:(x.missingLegs||[]).slice(0,7).map(m=>({
        name:clamp(m.name),category:clamp(m.category),
        requested:m.requested??null,
        listedOffers:(m.listedOffers||[]).slice(0,4).map(o=>({
         display:clamp(o.display),minimumToWin:o.minimumToWin??null}))
       }))
      }:{status:'UNVERIFIED',matchedLegs:null,requiredLegs:null,missingLegs:[]}]
     }))}
   })
  }
 };
}
export function sportsbookAiAuditFromSnapshot(input,{now=Date.now()}={}){
 const evidence=sportsbookAiEvidenceFromSnapshot(input);
 if(!evidence)return{status:'UNSUPPORTED_GAME',reviewOnly:true,
  canSetOdds:false,canChangePicks:false};
 const review=generateAdvisory('sportsbook',evidence,{now});
 return {
  status:review?.status||'INSUFFICIENT_EVIDENCE',
  league:input.league,gameId:String(input.gameId),
  checkedAt:new Date(now).toISOString(),sourceCheckedAt:evidence.sportsbooks.sourceCheckedAt,
  reviewedTiers:RISKS,books:BOOKS,
  flags:(review?.flags||[]).slice(0,14),
  items:(review?.items||[]).slice(0,6).map(item=>({
   risk:item.risk,book:item.book,marketStatus:item.marketStatus,
   exactLegs:item.exactLegs,requiredLegs:item.requiredLegs,
   proposedOfferChecks:item.proposedOfferChecks
  })),
  reviewOnly:true,canChangePicks:false,canSetOdds:false,
  bookmakerCombinedOddsVerified:false,
  aiProviderCalled:false,additionalSportsbookRequests:0,
  note:'Read-only, source-scoped deterministic preflight for every eligible game. AI can explain these findings on demand, but cannot verify combined sportsbook prices.'
 };
}
