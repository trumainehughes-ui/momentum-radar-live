// Automatically matched, FIRST-PARTY PUBLISHED DraftKings Network popular
// player props. This is NOT the complete sportsbook board and cannot verify
// book acceptance or correlated SGP payouts. Strictly separate from official
// sportsbook-site captured odds and bookmaker-priced slips.
export const PUBLIC_DKN_PROP_PAGE='https://dknetwork.draftkings.com/draftkings-sportsbook-player-props/';
const canon=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const countByRisk={Small:4,Medium:5,Nuke:6};
const cats=new Set(['td','passing','rushing','receiving','receptions']);
function publishedDKSourceValid(row){
 try{
  const u=new URL(row?.sourceUrl||'');
  return u.protocol==='https:'&&u.hostname==='dknetwork.draftkings.com'&&
   u.pathname==='/draftkings-sportsbook-player-props/'&&
   !u.username&&!u.password&&!u.port;
 }catch{return false}
}
export function automaticPublishedDKReview({
 report,model,gameId,date,teams,now=Date.now()
}={}){
 const allowed=new Set((Array.isArray(teams)?teams:[]).map(x=>String(x||'').toUpperCase()));
 if(!/^\d{7,12}$/.test(String(gameId||''))||
  !/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))||
  allowed.size!==2)return {offers:[],tiers:[],status:'INVALID_GAME_SCOPE'};
 const visible=(Array.isArray(report?.offers)?report.offers:[]).filter(o=>{
  const when=Date.parse(o?.observedAt||''),age=now-when;
  const odds=Number(o?.odds),line=Number(o?.line);
  return o.book==='DraftKings'&&o.publisher==='DraftKings Network'&&
   o.verification==='PUBLIC_PAGE_OBSERVATION_ONLY'&&
   o.rosterMatched===true&&o.gameId===String(gameId)&&o.date===date&&
   allowed.has(String(o.team||'').toUpperCase())&&
   cats.has(o.category)&&publishedDKSourceValid(o)&&
   Number.isFinite(age)&&age>=-60000&&age<=20*60000&&
   Number.isInteger(odds)&&(odds>=100||odds<=-100)&&
   (o.category==='td'?o.line===null:
    o.line!==null&&Number.isFinite(line)&&line>0);
 });
 // An older price in the same scrape must never overwrite a fresher
 // first-party observation merely because it appeared later in the payload.
 const latest=new Map();
 for(const offer of visible){
  const key=canon(offer.player)+'|'+String(offer.team).toUpperCase()+
   '|'+offer.category+'|'+offer.line;
  const prior=latest.get(key);
  if(!prior||Date.parse(offer.observedAt)>Date.parse(prior.observedAt))
   latest.set(key,offer);
 }
 const valid=[...latest.values()];
 const tiers=(Array.isArray(model?.sgps?.Analytics)?model.sgps.Analytics:[])
  .filter(x=>Object.hasOwn(countByRisk,x?.risk)).map(tier=>{
   const matched=[],used=new Set();
   for(const leg of Array.isArray(tier.legs)?tier.legs:[]){
    const name=leg.player||leg.name,cat=leg.category||leg.cat,
     team=String(leg.team||'').toUpperCase(),
     marketKey=canon(name)+'|'+team+'|'+cat;
    if(!name||!cats.has(cat)||!allowed.has(team)||
     used.has(marketKey)||String(leg.gameId||gameId)!==String(gameId))continue;
    const choices=valid.filter(o=>canon(o.player)===canon(name)&&
     o.category===cat&&String(o.team).toUpperCase()===team);
    if(!choices.length)continue;
    let pick;
    if(cat==='td')pick=choices.find(x=>x.line===null);
    else {
     const profile=(Array.isArray(model.categories?.[cat])?
      model.categories[cat]:[]).find(x=>canon(x.name||x.player)===canon(name)&&
       String(x.team||'').toUpperCase()===team);
     const projection=Number(profile?.edgeAnalytics?.modelProjection??profile?.projection);
     if(!Number.isFinite(projection)||projection<=0)continue;
     const target=projection*({Small:.8,Medium:1,Nuke:1.15}[tier.risk]);
     const sorted=[...choices].sort((a,b)=>a.line-b.line);
     const lower=[...sorted].reverse().find(x=>x.line<=target);
     const upper=sorted.find(x=>x.line>=target);
     // When the published list is sparse, select ONLY a genuinely listed
     // line adjacent to the model target; never synthesize a missing price.
     pick=tier.risk==='Nuke'?(upper||lower):(lower||upper);
    }
    if(!pick)continue;
    used.add(marketKey);
    matched.push({...pick});
   }
   return {risk:tier.risk,required:countByRisk[tier.risk],offers:matched,
    complete:matched.length>=countByRisk[tier.risk],
    bookmakerSgpQuoteVerified:false};
  });
 return {offers:valid,tiers,status:valid.length?
  'AUTOMATIC_FIRST_PARTY_POPULAR_PROPS_RESEARCH_ONLY':
  'NO_FRESH_AUTOMATIC_PUBLISHED_MARKETS',
  bookmakerSgpQuoteVerified:false,source:PUBLIC_DKN_PROP_PAGE,
  note:'DraftKings Network posts most-bet selections, not the entire DraftKings market board. Exact listed individual odds only; combined SGP price and game-day starter status remain unverified.'};
}
