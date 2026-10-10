import {nflCanonTeam} from '../nfl-official-injury-feed.js';

// NFL SGP tier rules. Leg count is NOT a measure of payout risk.
// A bookmaker's *combined* price alone can confirm a payout tier;
// model picks without that quote are only composition-constrained candidates.
// American +odds net profit = $10 * (positive odds / 100).\n// At +2000, $10 earns $200 PROFIT ($210 total return).
export const NFL_SGP_TIERS=Object.freeze({
 Small:Object.freeze({minOdds:2000,maxOdds:3000,maxTdLegs:1,minCategories:3,minYardageLegs:2,minYardageMarkets:2}),
 Medium:Object.freeze({minOdds:3000,maxOdds:8000,maxTdLegs:1,minCategories:3,minYardageLegs:3,minYardageMarkets:2}),
 Nuke:Object.freeze({minOdds:10000,maxOdds:Infinity,maxTdLegs:2,minCategories:3,minYardageLegs:3,minYardageMarkets:2})
});

export function classifyNflSgpOdds(americanOdds) {
 if(!Number.isFinite(americanOdds)||americanOdds<=0)return "UNKNOWN";
 if(americanOdds>=NFL_SGP_TIERS.Nuke.minOdds)return "Nuke";
 if(americanOdds>=NFL_SGP_TIERS.Small.minOdds&&americanOdds<=NFL_SGP_TIERS.Small.maxOdds)return "Small";
 if(americanOdds>NFL_SGP_TIERS.Medium.minOdds&&americanOdds<=NFL_SGP_TIERS.Medium.maxOdds)return "Medium";
 return "OUTSIDE_TIER_BANDS";
}


// Explicitly the payout of a $10 stake in USD. Combined book odds must
// be verified independently; this helper does not validate their source.
export function tenDollarSgpPayout(americanOdds){
 if(!Number.isFinite(americanOdds)||americanOdds<=0)return null;
 const profit=Math.round(americanOdds)/10;
 return {stake:10,netProfit:profit,totalReturn:profit+10,
  oddsCategory:classifyNflSgpOdds(americanOdds)};
}

export function assessNflSgpTier({risk,legs=[],requiredLegs,
  estimatedOdds=null,combinedBookOdds=null}={}) {
 const tier=NFL_SGP_TIERS[risk];
 const picks=Array.isArray(legs)?legs:[];
 const count=Number.isSafeInteger(requiredLegs)&&requiredLegs>0?
   requiredLegs:picks.length;
 const categories=picks.map(x=>String(x?.cat||x?.category||"").toLowerCase());
 const distinct=new Set(categories.filter(Boolean));
 const tdCount=categories.filter(c=>c==="td").length;
 const yardageCategories=["passing","rushing","receiving"];
 const yards=picks.filter(x=>yardageCategories.includes(String(x?.cat||x?.category||"").toLowerCase()));
 const yardageMarkets=new Set(yards.map(x=>String(x?.cat||x?.category||"").toLowerCase()));
 const ids=picks.map(x=>String(x?.playerID||x?.playerId||"").trim()||
   String(x?.name||"").toUpperCase().replace(/[^A-Z0-9]/g,""));
 const duplicatePlayers=new Set(ids).size!==ids.length;
 const compositionOk=Boolean(tier&&picks.length===count&&count>=2&&
   !duplicatePlayers&&ids.every(Boolean)&&
   tdCount<=tier.maxTdLegs&&distinct.size>=tier.minCategories&&
   yards.length>=tier.minYardageLegs&&yardageMarkets.size>=tier.minYardageMarkets);
 // Independent leg multiplication is *never* bookmaker-correlated SGP odds.
 const estimatedBand=Number.isFinite(estimatedOdds)?
   classifyNflSgpOdds(estimatedOdds):null;
 const observedBand=Number.isFinite(combinedBookOdds)?
   classifyNflSgpOdds(combinedBookOdds):null;
 const status=!tier?"UNKNOWN_TIER":!compositionOk?
   "TIER_COMPOSITION_MISMATCH":observedBand&&observedBand!==risk?
   "ACTUAL_BOOK_PRICE_OUTSIDE_TIER":estimatedBand&&estimatedBand!==risk?
   "INDEPENDENT_ESTIMATE_OUTSIDE_TIER":"COMBINED_PRICE_UNVERIFIED";
 const reason=!tier?"Unsupported tier":
   !compositionOk?`${risk} requires ${tier.minYardageLegs}+ passing/rushing/receiving yardage legs across ${tier.minYardageMarkets}+ yardage markets, ${tier.minCategories}+ distinct prop markets, and at most ${tier.maxTdLegs} anytime TD; currently ${yards.length} yardage and ${tdCount} TD. Await valid yardage instead of substituting touchdowns.`:
   status==="ACTUAL_BOOK_PRICE_OUTSIDE_TIER"?
   `The observed combined bookmaker odds classify as ${observedBand}, not ${risk}; do not label this ${risk}.`:
   status==="INDEPENDENT_ESTIMATE_OUTSIDE_TIER"?
   `The independent-leg estimate falls outside ${risk}; actual combined sportsbook odds remain unverified.`:
   `${risk} composition candidate only. Exact sportsbook combined odds are unverified; the target return is not guaranteed.`;
 return {risk: String(risk||""),status,reason,compositionOk,
   tdLegs:tdCount,yardageLegs:yards.length,yardageMarketCount:yardageMarkets.size,
   marketCategories:[...distinct],
   requiredLegs:count,observedOddsCategory:observedBand,
   estimatedOddsCategory:estimatedBand,
   combinedBookQuoteVerified:false,tierVerified:false,
   modelOnly:true,advisoryOnly:true};
}

// Fill passing/rushing/receiving yardage first. Receptions are useful
// supplemental props, but do not count toward the yardage minimum.
// `add` may reject unavailable or unsupported candidate thresholds.
// Candidates are pre-ranked by the model; no AI-generated odds are used.
export function fillNflSgpMarketMix({risk,count,pool=[],legs=[],add}={}){
 const tier=NFL_SGP_TIERS[risk];
 if(!tier||!Number.isSafeInteger(count)||count<2||
    !Array.isArray(pool)||!Array.isArray(legs)||typeof add!=="function")
   return {filled:false,reason:"invalid_market_mix_input"};
 const yardage=["passing","rushing","receiving"];
 const category=x=>String(x?.cat||x?.category||"").toLowerCase();
 const attempt=x=>Boolean(x&&legs.length<count&&add(x));
 const sortedYardageTypes=yardage.slice().sort((a,b)=>{
   const ai=pool.findIndex(x=>category(x)===a),bi=pool.findIndex(x=>category(x)===b);
   return (ai<0?Infinity:ai)-(bi<0?Infinity:bi);
 });
 // Ensure at least two independent yardage markets first, not just
 // passing yards from both QBs or multiple legs from one WR.
 for(const type of sortedYardageTypes){
   const covered=new Set(legs.filter(v=>yardage.includes(category(v))).map(category));
   if(covered.size>=tier.minYardageMarkets)break;
   if(covered.has(type))continue;
   for(const x of pool)if(category(x)===type&&attempt(x))break;
 }
 for(const x of pool){
   if(legs.filter(v=>yardage.includes(category(v))).length>=tier.minYardageLegs)break;
   if(yardage.includes(category(x)))attempt(x);
 }
 // At most one TD for Small/Medium; a touchdown can complement yardage
 // but must never replace required yardage.
 if(legs.length<count){
   for(const x of pool)if(category(x)==="td"&&attempt(x))break;
 }
 // Complete with non-TD alternatives (including receptions), favouring
 // least represented categories rather than a wall of one market.
 for(const maxPerCategory of [1,2,Infinity]){
   for(const x of pool){
     if(legs.length>=count)break;
     const cat=category(x);
     if(cat==="td")continue;
     if(legs.filter(v=>category(v)===cat).length>=maxPerCategory)continue;
     attempt(x);
   }
 }
 // Only the Nuke tier may use a second TD if non-TD options run out.
 if(risk==="Nuke"&&legs.length<count){
   for(const x of pool)if(category(x)==="td"&&attempt(x))break;
 }
 const assessed=assessNflSgpTier({risk,legs,requiredLegs:count});
 return {filled:assessed.compositionOk,assessment:assessed,reason:assessed.reason};
}


/**
 * Check event, both participating teams, and the current game's actual ESPN
 * roster BEFORE selecting model legs. A guessed team/name or another game's
 * player cannot be rescued by merely relabeling the player's team.
 */
export function nflLegMatchesGameRoster(leg,{
 gameId=null,home=null,away=null,rosterChecked=false,
 rosterById=new Map(),rosterByName=new Map(),
 normalizeName=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'')
}={}){
 if(!gameId)return true; // preserve source-independent unit consumers
 if(!leg||rosterChecked!==true)return false;
 const h=nflCanonTeam(home),a=nflCanonTeam(away),team=nflCanonTeam(leg.team);
 const opponent=leg.opponent?nflCanonTeam(leg.opponent):'';
 if(!h||!a||h===a||!team||![h,a].includes(team))return false;
 if(String(leg.eventID||leg.gameId||'')!==String(gameId))return false;
 if(opponent&&opponent!==(team===h?a:h))return false;
 const id=String(leg.playerID||leg.playerId||'').trim(),name=normalizeName(leg.name);
 const byId=rosterById instanceof Map?rosterById.get(id):null;
 const byName=rosterByName instanceof Map?rosterByName.get(name):null;
 // Numeric ESPN athlete IDs must be present in the active game's roster.
 // A name-only match must never override a different athlete ID.
 if(/^\d+$/.test(id)&&!byId)return false;
 const roster=byId||byName;
 if(!name||!roster||nflCanonTeam(roster.team)!==team)return false;
 if(roster.name&&normalizeName(roster.name)!==name)return false;
 if(byId&&byName&&nflCanonTeam(byName.team)!==team)return false;
 if(byName?.id&&/^\d+$/.test(id)&&String(byName.id)!==id)return false;
 if(roster.id&&/^\d+$/.test(id)&&String(roster.id)!==id)return false;
 return true;
}

/**
 * Construct as many as seven properly verified model legs, falling back to
 * six or five before declaring a Nuke unavailable. This does not verify
 * correlated sportsbook price or promise a +10000 combined quote.
 */
export function selectNflAdaptiveNuke(make){
 if(typeof make!=='function')return null;
 let smallest=null;
 for(const count of [7,6,5]){
  const candidate=make('Nuke',count);
  if(count===5)smallest=candidate;
  if(!candidate?.tierAssessment?.compositionOk||
    !Array.isArray(candidate.legs)||candidate.legs.length!==count)continue;
  // Never describe a conservative / normal yardage threshold as a Nuke.
  const lifted=candidate.legs.every(x=>{
   if(x.cat==='td')return true;
   const center=Number(x.predictiveProjection??x.projection??x.perGame);
   const threshold=Number(x.analyticsThreshold);
   return Number.isFinite(center)&&center>0&&Number.isFinite(threshold)&&threshold>center;
  });
  if(lifted)return {...candidate,adaptiveLegCount:count};
 }
 const reason='No five-to-seven-leg Nuke cleared game roster verification, distinct-yardage mix and above-projection ceilings. Waiting for eligible players with supported elevated yardage targets.';
 return {...(smallest||{}),risk:'Nuke',legs:[],marketMix:[],
  candidateComplete:false,publishable:false,combinedBookQuoteVerified:false,
  estimatedOdds:null,actualSgpOdds:null,nukeCeilingVerified:false,
  reason};
}

/**
 * Final, league-wide presentation gate. Every completed card must pass the
 * yardage-first rules AFTER roster and injury exclusions; a stale/legacy or
 * bookmaker-generated all-touchdown card must not bypass the model builder.
 */
export function guardFinalNflSgpCards(sgps,{
 blockedIds=new Set(),blockedNames=new Set(),normalizeName=x=>String(x||"").toUpperCase().replace(/[^A-Z0-9]/g,""),
 gameId=null,home=null,away=null,rosterChecked=null,
 rosterById=new Map(),rosterByName=new Map()
}={}){
 const ids=blockedIds instanceof Set?blockedIds:new Set();
 const names=blockedNames instanceof Set?blockedNames:new Set();
 const blocked=x=>ids.has(String(x?.playerID||x?.playerId||""))||
   names.has(normalizeName(x?.name));
 const matchIdentity=leg=>nflLegMatchesGameRoster(leg,{
   gameId,home,away,rosterChecked,rosterById,rosterByName,normalizeName
 });
 const out={};
 for(const [book,items] of Object.entries(sgps||{})){
  if(!Array.isArray(items)){out[book]=items;continue}
  out[book]=items.map(item=>{
   const s=item||{},before=Array.isArray(s.legs)?s.legs:[],
    after=before.filter(x=>!blocked(x));
   const gameIdentityOk=!gameId||after.every(matchIdentity)&&before.length>0;
   const identityFailed=Boolean(gameId&&!gameIdentityOk);
   const tierAssessment=assessNflSgpTier({
     risk:s.risk,legs:after,requiredLegs:s.requiredLegs
   });
   const injuryPruned=after.length!==before.length;
   if(tierAssessment.compositionOk&&!injuryPruned&&!identityFailed)
     return {...s,tierAssessment};
   const finalized=identityFailed?{...tierAssessment,compositionOk:false,
     status:"GAME_OR_ROSTER_IDENTITY_UNVERIFIED",
     reason:"Player, roster, team or ESPN event identity could not be verified for this selected NFL game. Rebuild after checking current rosters."}:tierAssessment;
   return {...s,legs:[],tierAssessment:finalized,eligibilityPruned:injuryPruned,
    gameIdentityVerified:false,
    candidateComplete:false,publishable:false,combinedBookQuoteVerified:false,
    verifiedLegs:0,estimatedOdds:null,actualSgpOdds:null,
    payoutBandVerified:false,nukePayoutVerified:false,nukeCeilingVerified:false,
    momentumScore:null,sgpScore:null,explanation:null,marketMix:[],
    reason:injuryPruned
      ?"An injury or roster change invalidated this parlay. Rebuild using eligible yardage picks."
      :finalized.reason||"This SGP needs verified yardage markets before it can be displayed."
   };
  });
 }
 return out;
}

/**
 * Avoid false "Medium" 400-yard predictions when the actual model projects
 * 325, and ensure a Nuke alt is ABOVE the model's center (not below Medium).
 * The historical ceiling is a statistical guard, NOT an offered book market.
 */
export function modelNflSgpStatThreshold(player,cat,risk,requested){
 if(cat==="td")return "Anytime TD";
 if(!["passing","rushing","receiving","receptions"].includes(cat)||
    !["Small","Medium","Nuke"].includes(risk))return null;
 const num=x=>x===null||x===undefined||x===""?null:Number(x);
 const central=num(player?.predictiveProjection??player?.projection??player?.perGame),
  raw=num(requested),ceiling=num(player?.range?.ceiling);
 if(central===null||raw===null||!Number.isFinite(central)||!Number.isFinite(raw)||
    central<=0||raw<=0)return null;
 const step=cat==="receptions"?1:5;
 const floor=x=>Math.floor(x/step)*step,ceil=x=>Math.ceil(x/step)*step;
 const basicMin=cat==="passing"?125:cat==="receptions"?1:5;
 const evidenceCeiling=ceiling!==null&&Number.isFinite(ceiling)&&ceiling>0?
   floor(ceiling):null;
 let result;
 if(risk==="Small"){
  result=Math.min(floor(raw),floor(central-step));
 }else if(risk==="Medium"){
  result=Math.min(floor(raw),floor(central),
    evidenceCeiling===null?Infinity:evidenceCeiling-step);
 }else{
  // Meaningfully above the central projection and the normal Medium target.
  // If there is no observed ceiling, don't manufacture a Nuke alternate.
  if(evidenceCeiling===null)return null;
  const lift=cat==="passing"?25:cat==="receptions"?1:10;
  const minimum=ceil(central+lift);
  if(evidenceCeiling<minimum)return null;
  result=Math.min(Math.max(ceil(raw),minimum),evidenceCeiling);
 }
 return Number.isFinite(result)&&result>=basicMin?result:null;
}
