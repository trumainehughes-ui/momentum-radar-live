// Exact offered-line selection for all NFL yardage and reception ladders.
// A projection proposes a target; only a fresh real first-party offer can
// become a selected sportsbook market. No odds API or synthesized threshold.
import {validateBookPageUrl,CAPTURE_MAX_AGE_MS} from './public-book-text-capture.js';
const numberCategories=new Set(['passing','rushing','receiving','receptions','points','rebounds','assists','threes']);
const canonical=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const decimalOdds=a=>a>=100?1+a/100:a<=-100?1+100/Math.abs(a):NaN;
const standardDeviation=values=>{
 const good=(Array.isArray(values)?values:[]).map(Number).filter(v=>Number.isFinite(v)&&v>=0);
 if(good.length<3)return null;
 const mean=good.reduce((a,b)=>a+b,0)/good.length;
 return Math.sqrt(good.reduce((n,v)=>n+(v-mean)**2,0)/(good.length-1));
};
// Smooth approximation of N(0,1) CDF, used for *relative ranking only*.
// These are not calibrated betting probabilities.
const normalCdf=z=>{
 const t=1/(1+0.2316419*Math.abs(z));
 const d=0.3989422804014327*Math.exp(-z*z/2);
 const tail=d*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
 return z>=0?1-tail:tail;
};
export function selectBestListedBookAlternate({
 offers,book,gameId,player,category,projection,
 desiredTarget=null,risk='Medium',recentGameValues=[],now=Date.now()
}={}){
 if(!['Small','Medium','Nuke'].includes(risk)||!numberCategories.has(category)||
  !book||!gameId||!player||!Number.isFinite(Number(projection))||
  Number(projection)<=0)return {ok:false,reason:'MODEL_OR_MARKET_CONTEXT_MISSING',offer:null};
 const forecast=Number(projection);
 const tierTarget=Number.isFinite(Number(desiredTarget))&&Number(desiredTarget)>0?
  Number(desiredTarget):forecast*({Small:0.8,Medium:1,Nuke:1.15}[risk]);
 const eligible=(Array.isArray(offers)?offers:[]).filter(o=>{
  const age=now-Date.parse(String(o?.observedAt||''));
  const line=Number(o?.line),price=Number(o?.odds);
  return o?.book===book&&String(o.gameId)===String(gameId)&&
   canonical(o.player)===canonical(player)&&o.category===category&&
   validateBookPageUrl(o.sourceUrl,book)&&Number.isFinite(age)&&
   age>=-60000&&age<=CAPTURE_MAX_AGE_MS&&
   o.line!==null&&o.line!==undefined&&Number.isFinite(line)&&line>0&&
   Number.isFinite(price)&&(price>=100||price<=-100)&&
   (o.verification==='VISIBLE_BOOK_PAGE_USER_OBSERVATION_ONLY'||
    o.verification==='PUBLIC_PAGE_OBSERVATION_ONLY');
 });
 if(!eligible.length)return {ok:false,reason:'NO_CURRENT_EXACT_BOOK_MARKETS',offer:null};
 // Never create an imaginary intermediate line. Limit decision to the
 // immediate real offered threshold below and above the model's target.
 const sorted=[...eligible].sort((a,b)=>Number(a.line)-Number(b.line));
 const below=[...sorted].reverse().find(o=>Number(o.line)<=tierTarget);
 const above=sorted.find(o=>Number(o.line)>=tierTarget);
 const brackets=[...new Map([below,above].filter(Boolean).map(o=>[Number(o.line),o])).values()];
 if(!brackets.length)return {ok:false,reason:'NO_BRACKETING_BOOK_MARKETS',offer:null};
 const volatility=standardDeviation(recentGameValues);
 const sigma=Math.max(category==='receptions'?1.1:15,
  volatility??Math.max(category==='receptions'?1.7:20,forecast*.28));
 const candidates=brackets.map(o=>{
  const chance=Math.max(.02,Math.min(.98,normalCdf((forecast-Number(o.line)+.5)/sigma)));
  const d=decimalOdds(Number(o.odds));
  const estimatedEdge=chance*d-1;
  return{offer:o,chance,estimatedEdge};
 });
 let selected;
 if(candidates.length===1)selected=candidates[0];
 else{
  const low=candidates.find(x=>Number(x.offer.line)===Number(below?.line));
  const high=candidates.find(x=>Number(x.offer.line)===Number(above?.line));
  if(risk==='Small')selected=low||high;
  else if(risk==='Medium')
   selected=[...candidates].sort((a,b)=>
    (b.estimatedEdge-.18*(1-b.chance))-(a.estimatedEdge-.18*(1-a.chance)))[0];
  else{
   // Nuke may use the higher *existing* offer for greater upside when the
   // model supports it, but not when its risk/value falls far behind.
   selected=high&&high.chance>=.12&&
    (high.estimatedEdge>=(low?.estimatedEdge??-Infinity)-.25)?
    high:(low||high);
  }
 }
 return{
  ok:true,
  offer:{...selected.offer}, // exact bookmaker line/odds unchanged
  candidateOffers:brackets.map(x=>({line:Number(x.line),odds:Number(x.odds),book:x.book})),
  rule:'NEAREST_ACTUALLY_LISTED_BOOK_OPTIONS_ONLY',
  analysis:'Uncalibrated model forecast, recent-game volatility when available, tier risk and individual bookmaker prices. No inferred line and no combined sportsbook SGP quote.',
  direction:Number(selected.offer.line)<tierTarget?'LOWER_LISTED':
   Number(selected.offer.line)>tierTarget?'UPPER_LISTED':'EXACT_LISTED',
  evaluatedAt:new Date(now).toISOString()
 };
}
