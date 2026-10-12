// Public-facing mirror of the owner's universal Sharp Intelligence rules.
// Intentionally consumes ONLY the previously sanitized game view. This is
// explanatory read-only output, not a substitute for authenticated odds,
// independently calibrated probabilities or the protected market collector.
import {evaluateSharpSlate,sharpOdds,SHARP_ENGINE_VERSION}
 from './ai-mechanics/sharp-engine.js';

const CATS=['td','passing','rushing','receiving','receptions'];
const MARKET={td:'anytime_touchdown',passing:'passing_yards',rushing:'rushing_yards',
 receiving:'receiving_yards',receptions:'receptions'};
const str=(s,n=100)=>String(s??'').slice(0,n);
const numeric=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const isFresh=x=>x?.status==='CURRENT';
const evidenceReasons=[
 'Current independently cross-verified sportsbook prices have not been established by the public feed.',
 'A calibrated outcome probability and uncertainty interval are not yet available for verified +EV pricing.'
];
export function publicSharpReview(view,{sport='nfl',now=Date.now()}={}){
 const empty={version:SHARP_ENGINE_VERSION,sport,gameId:String(view?.gameId||''),
  status:'WAIT',analysisAuthority:'READ_ONLY',
  riskPolicy:{unitSize:'1% of bankroll',recommendedUnits:0,
   maximumUnits:0.5,requiresVerifiedEdge:true},
  process:['DATA_GATHERING','CROSS_VERIFICATION','STATISTICAL_EVALUATION'],
  message:'A market must pass authenticated odds, player-eligibility and calibrated-probability checks before any +EV verdict.',
  candidates:[]};
 if(!view||!['CURRENT','LAST_SAVED'].includes(view.status)||!view.ok)return empty;
 const descriptors=CATS.flatMap(cat=>
  (Array.isArray(view.categories?.[cat])?view.categories[cat]:[]).slice(0,6)
   .map(x=>({cat,x})));
 const candidates=descriptors.map(({cat,x},i)=>({
  playerId:'public-'+i, name:str(x.name,85),
  market:MARKET[cat],side:cat==='td'?'YES':'OVER',
  line:cat==='td'?'yes':String(x.projection??'unavailable'),
  // No probability or verified offer passed to evaluator.
  // Model TD chance is an uncalibrated display-only statistic.
 }));
 const scored=evaluateSharpSlate({sport,gameId:String(view.gameId),candidates},
  {now,trustedServerEvidence:false});
 const rows=descriptors.map(({cat,x},i)=>{
  const review=scored.selections[i];
  // Prices originate in the existing sanitized view and are EXPLICITLY not
  // enough to prove a +EV edge. Ignore them if game snapshot is stale.
  const offer=isFresh(view)?x.bookOffer:null;
  const rawOdds=offer&&numeric(offer.odds)?
   (Number(offer.odds)>0?'+':'')+String(offer.odds):null;
  const price=rawOdds?sharpOdds(rawOdds):null;
  const modelChance=cat==='td'&&numeric(x.modelChancePct)?
   Math.round(Number(x.modelChancePct)):null;
  return{
   name:str(x.name,85),team:str(x.team,4),category:cat,
   market:MARKET[cat],status:review?.decision||'WAIT',
   marketContext:{book:price?str(offer.book,30):null,
    displayOdds:price?price.americanOdds:null,
    line:price&&numeric(offer.line)?Number(offer.line):null,
    impliedProbabilityPct:price?
     Math.round(price.impliedProbability*10000)/100:null,
    pricingStatus:price?'OBSERVED_INDIVIDUAL_PRICE_NOT_EV_VERIFIED':'UNVERIFIED'},
   quantitativeAngle:{modelProjection:cat==='td'?null:
     numeric(x.projection)?Number(x.projection):null,
    estimatedTdChancePct:modelChance,
    modelChanceStatus:modelChance===null?'NOT_AVAILABLE':'UNCALIBRATED_MODEL_ESTIMATE',
    historicalSampleGames:numeric(x.gameSample)?Number(x.gameSample):null},
   marketMovement:{status:'UNVERIFIED',sharpVsPublic:'UNAVAILABLE',
    closingLineValue:'NOT_ESTABLISHED'},
   expectedValue:{verdict:'WAIT',reason:'Verified +EV not established',
    estimatedRoiPct:null},
   bankroll:{units:0,method:'NO_VERIFIED_EDGE'},
   limitations:evidenceReasons
  };
 });
 return {...empty,status:rows.length?'REVIEW':'WAIT',
  message:view.status==='LAST_SAVED'?
   'This is older saved model analysis, not current sportsbook information. All +EV claims remain on hold.':
   'Model projections are available; live independent price and probability calibration must be verified before a +EV bet.',
  candidates:rows};
}
