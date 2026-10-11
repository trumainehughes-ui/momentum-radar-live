// Deterministic, review-only SGP alternate-line preview.
// The original model candidate remains immutable. This is NOT an AI
// generated sportsbook market, a verified completed SGP or a priced ticket.
import {modelNflSgpStatThreshold,assessNflSgpTier} from './ai-mechanics/nfl-sgp-tiers.js';

const YARDAGE=new Set(['passing','rushing','receiving']);
const OTHER=new Set(['receptions']);
const norm=x=>String(x??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const same=(m,l,gameId)=>Boolean(m&&l&&String(m.eventID||'')===String(gameId)&&
 String(l.eventID||l.gameId||'')===String(gameId)&&
 String(m.playerID||'')===String(l.playerID||l.playerId||'')&&
 norm(m.name)===norm(l.name)&&norm(m.team)===norm(l.team)&&
 m.category===String(l.cat||l.category||'').toLowerCase()&&
 Number(m.requested)===Number(l.analyticsThreshold??l.threshold));
function observed(display,minimum){
 const n=finite(minimum),label=String(display||'').trim();
 if(n===null||!Number.isSafeInteger(n)||n<1||label.length>90)return false;
 const plus=label.match(/^(\d+)\+$/);
 if(plus)return Number(plus[1])===n;
 const over=label.match(/^Over\s+(\d+)\.5$/i);
 return Boolean(over&&Number(over[1])+1===n);
}
const limited=x=>String(x??'').slice(0,85);

/**
 * The server's exact-market audit is ALREADY validated by the action planner.
 * We nevertheless require matching model/player/team/event identity again
 * before displaying a specific potentially replaceable offered line.
 * A synthetic or user-entered offer can never pass the official market audit.
 */
export function nflSgpRescuePreview({
 gameId,risk,book,legs=[],missingLegs=[]
}={}){
 const fail=reason=>({status:'RECHECK_REQUIRED',reason,
  book,risk,proposals:[],rebuildPreview:null,autoApplied:false,
  combinedPriceVerified:false,needsUpdatedModel:true});
 if(!/^\d{7,12}$/.test(String(gameId||''))||
  !['Small','Medium','Nuke'].includes(risk)||
  !['DraftKings','FanDuel'].includes(book)||
  !Array.isArray(legs)||!Array.isArray(missingLegs)||
  !legs.length||!missingLegs.length)
  return fail('INVALID_SOURCE_SCOPED_MISSING_LEGS');
 const indexes=new Set(),proposals=[];
 for(const m of missingLegs.slice(0,7)){
  const i=legs.findIndex((l,j)=>!indexes.has(j)&&same(m,l,gameId));
  if(i<0)return fail('MISSING_LEG_IDENTITY_MISMATCH');
  indexes.add(i);
  const leg=legs[i],cat=String(leg.cat||leg.category||'').toLowerCase();
  if(!YARDAGE.has(cat)&&!OTHER.has(cat))
   return fail('NO_ELIGIBLE_SAME_PLAYER_ALTERNATE');
  const offers=(Array.isArray(m.listedOffers)?m.listedOffers:[]).slice(0,16);
  const possible=[];
  for(const offer of offers){
   const n=finite(offer.minimumToWin);
   if(!observed(offer.display,n))continue;
   if(YARDAGE.has(cat)&&n%5!==0)continue;
   if(!YARDAGE.has(cat)&&(!Number.isInteger(n)||n<1))continue;
   if(n===Number(m.requested))continue; // not a true alternate
   const modeled=modelNflSgpStatThreshold(leg,cat,risk,n);
   // A market exists does not mean it meets this model's risk ceiling.
   if(modeled!==n)continue;
   if(legs.some((l,j)=>j!==i&&
     String(l.playerID||l.playerId)===String(leg.playerID||leg.playerId)&&
     String(l.cat||l.category).toLowerCase()===cat&&
     Number(l.analyticsThreshold??l.threshold)===n))continue;
   possible.push({threshold:n,sourceLabel:limited(offer.display),
    modelCompatible:true,requiresUpdatedProjection:true,
    needsFreshBookAudit:true,combinedOddsVerified:false});
  }
  possible.sort((a,b)=>Math.abs(a.threshold-Number(m.requested))-
   Math.abs(b.threshold-Number(m.requested))||a.threshold-b.threshold);
  proposals.push({player:limited(leg.name),playerID:String(leg.playerID||leg.playerId),
   team:limited(leg.team),category:cat,
   requested:m.requested,observedAlternates:possible.slice(0,3),
   status:possible.length?'MODEL_COMPATIBLE_RECHECK':'NO_MODEL_SUPPORTED_ALTERNATE'});
 }
 const complete=proposals.length===missingLegs.length&&
  proposals.every(p=>p.observedAlternates.length);
 if(!complete)return{...fail('AT_LEAST_ONE_LEG_HAS_NO_SUPPORTED_OFFER'),proposals};
 const newLegs=legs.map(l=>({...l}));
 proposals.forEach((p,k)=>{
  const i=legs.findIndex(l=>String(l.playerID||l.playerId)===p.playerID&&
   norm(l.name)===norm(p.player)&&norm(l.team)===norm(p.team)&&
   String(l.cat||l.category).toLowerCase()===p.category&&
   Number(l.analyticsThreshold??l.threshold)===Number(p.requested));
  if(i>=0)newLegs[i].analyticsThreshold=p.observedAlternates[0].threshold;
 });
 const assessment=assessNflSgpTier({risk,legs:newLegs,requiredLegs:legs.length});
 if(!assessment.compositionOk)return{...fail('CANDIDATE_TIER_COMPOSITION_INVALID'),proposals};
 return{status:'PROVISIONAL_BOOK_LINE_REBUILD',risk,book,
  reason:'All replacement lines were observed for this book and passed the existing model-range screen. Full player/roster, projection and book/price revalidation is still mandatory.',
  proposals,rebuildPreview:{
   risk,book,legs:newLegs.slice(0,7).map(l=>({
    player:limited(l.name),team:limited(l.team),
    category:String(l.cat||l.category),threshold:l.analyticsThreshold??l.threshold
   })),modelTierCompositionChecked:true,bookQuoteVerified:false,
   playerAndInjuryRecheckedAfterChange:false,readyToPublish:false
  },autoApplied:false,combinedPriceVerified:false,needsUpdatedModel:true};
}
