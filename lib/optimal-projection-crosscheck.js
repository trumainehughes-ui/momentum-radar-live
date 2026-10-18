// Advisory projection reference only. ChatGPT plugin access is not a server API.
// An authorized publisher may snapshot Optimal's estimates, subject to scope,
// freshness and player/team matching. Never convert these into bookmaker offers.
export const OPTIMAL_REFERENCE_TTL_MS=90*60*1000;
const TYPES=Object.freeze({
 nfl:{passingYards:'passing',rushingYards:'rushing',receivingYards:'receiving',
  receptions:'receptions',receivingTouchdowns:'td',rushingAndReceivingTouchdowns:'td'},
 nba:{points:'points',rebounds:'rebounds',assists:'assists',threePointersMade:'threes',
  threePointFieldGoalsMade:'threes',steals:'steals',blocks:'blocks'}
});
const canon=x=>String(x??'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g,'');
const bounded=(n,max)=>n===null||n===undefined||n===''?null:
 Number.isFinite(Number(n))&&Number(n)>=0&&Number(n)<=max?
 Math.round(Number(n)*100)/100:null;
const dateValid=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d))&&
 !Number.isNaN(Date.parse(d+'T12:00:00Z'));
export function normalizeOptimalReference(input,{now=Date.now()}={}){
 const league=String(input?.league||'').toLowerCase();
 const day=String(input?.date||''),gameId=String(input?.gameId||'');
 const eventId=String(input?.optimalEventId||'');
 const observed=Date.parse(String(input?.observedAt||''));
 const teams=[String(input?.home||'').toUpperCase(),String(input?.away||'').toUpperCase()];
 if(!TYPES[league]||!dateValid(day)||!/^\d{7,12}$/.test(gameId)||
   !/^[0-9a-f-]{36}$/i.test(eventId)||teams.some(t=>!/^[A-Z]{2,4}$/.test(t))||
   teams[0]===teams[1]||!Number.isFinite(observed)||
   observed>now+60000||now-observed>OPTIMAL_REFERENCE_TTL_MS||
   !Array.isArray(input?.players)||input.players.length>100)
  return {ok:false,error:'invalid_or_stale_projection_scope'};
 const entries=[],seen=new Set();
 for(const player of input.players){
  const name=String(player?.name||player?.full_name||'').trim().slice(0,90);
  const team=String(player?.team||'').toUpperCase();
  const id=String(player?.optimalPlayerId||player?.player_id||'');
  if(!name||!teams.includes(team)||!/^[0-9a-f-]{36}$/i.test(id)||
     !Array.isArray(player.projections))continue;
  for(const row of player.projections){
   const propType=String(row?.propType||'');
   const category=TYPES[league][propType];
   if(!category)continue;
   const p25=bounded(row.p25,2000),p50=bounded(row.p50,2000),
    p75=bounded(row.p75,2000),p90=bounded(row.p90,2000);
   if(p50===null||p25===null||p75===null||p90===null||
    !(p25<=p50&&p50<=p75&&p75<=p90))continue;
   const key=canon(name)+'|'+team+'|'+category;
   // Two Optimal prop types can describe the same TD outcome: no duplicates.
   if(seen.has(key))continue;
   seen.add(key);
   entries.push({player:name,team,category,optimalPlayerId:id,p25,p50,p75,p90});
  }
 }
 return {ok:true,schemaVersion:1,league,date:day,gameId,home:teams[0],away:teams[1],
  optimalEventId:eventId,observedAt:new Date(observed).toISOString(),
  status:'AUTHORIZED_OPTIMAL_RESEARCH_REFERENCE',source:'Optimal Sports Projections',
  bookmakerLineVerified:false,combinedBookQuoteVerified:false,
  injuryClearanceVerified:false,aiGenerated:false,players:entries.slice(0,500)};
}
export function optimalCrosscheck(model,reference,{now=Date.now()}={}){
 if(!model||reference?.ok!==true||reference?.status!=='AUTHORIZED_OPTIMAL_RESEARCH_REFERENCE'||
   reference?.gameId!==String(model.gameId)||reference?.date!==model.date||
   reference?.league!==String(model.league||'nfl')||
   Number.isNaN(Date.parse(reference.observedAt))||
   Math.abs(now-Date.parse(reference.observedAt))>OPTIMAL_REFERENCE_TTL_MS)
  return {status:'NO_CURRENT_OPTIMAL_REFERENCE',matches:[]};
 const map=new Map(reference.players.map(p=>[canon(p.player)+'|'+p.team+'|'+p.category,p]));
 const tiers=['Small','Medium','Nuke'].map(risk=>{
  const sourceCards=Array.isArray(model.sgps?.Analytics)?model.sgps.Analytics:
   Array.isArray(model.modelResearchTiers)?model.modelResearchTiers:
   Array.isArray(model.sgps)?model.sgps:[];
  const card=sourceCards.find(c=>c?.risk===risk);
  const legs=Array.isArray(card?.legs)?card.legs:[];
  const matches=legs.map(l=>{
   const category=String(l.cat||l.category||'').toLowerCase();
   const player=String(l.name||l.player||'');
   const team=String(l.team||'').toUpperCase();
   const p=map.get(canon(player)+'|'+team+'|'+category);
   if(!p)return null;
   const own=Number(l.predictiveProjection??l.projection);
   return {player,team,category,p50:p.p50,p75:p.p75,p90:p.p90,
    modelCenter:Number.isFinite(own)&&own>0?own:null,
    medianDelta:Number.isFinite(own)&&own>0?Math.round((p.p50-own)*100)/100:null,
    commentary:'Independent projection comparison only; no sportsbook line or combined odds'};
  }).filter(Boolean);
  return {risk,eligibleModelLegs:legs.length,matchedReferenceLegs:matches.length,
    status:matches.length?'REFERENCE_AVAILABLE':'NO_MATCHING_PLAYER_FORECAST',
    matches};
 });
 return {status:'ADVISORY_OPTIMAL_CROSSCHECK',source:'Optimal Sports Projections',
  observedAt:reference.observedAt,modelOnly:true,bookmakerSgpQuoteVerified:false,
  affectsEligibility:false,affectsBookOdds:false,tiers};
}
