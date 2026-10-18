// The owner and public NFL matchup screens must consume the SAME saved,
// injury-screened player forecasts and SGP research. This is only a display
// adapter; it neither collects sportsbook data nor validates new offers.
export const NFL_SHARED_CATEGORIES=Object.freeze(['td','passing','rushing','receiving','receptions']);
export const NFL_SHARED_TIERS=Object.freeze(['Small','Medium','Nuke']);
const canonical=x=>String(x??'').trim().toUpperCase();
const key=(x,cat)=>[canonical(x?.name||x?.player),canonical(x?.team),cat].join('|');
const millis=x=>Date.parse(String(x||''));
export function ownerNflPublishedParity(owner,published,{date,gameId,now=Date.now()}={}){
 const fail=reason=>({ok:false,status:'NOT_SYNCED',reason,
  gameId:String(gameId||''),date:String(date||''),categories:
   Object.fromEntries(NFL_SHARED_CATEGORIES.map(cat=>[cat,[]])),tiers:[],bookParlays:[]});
 if(!owner?.ok||!published?.ok||published?.status!=='CURRENT'||
    published?.updatedDataCurrent!==true)return fail('publication_not_current');
 if(String(owner.gameId)!==String(gameId)||String(published.gameId)!==String(gameId)||
    String(owner.date)!==String(date)||String(published.date)!==String(date)||
    owner.home!==published.home||owner.away!==published.away)
  return fail('game_or_team_mismatch');
 const first=millis(owner.fetchedAt),second=millis(published.updatedAt);
 if(!Number.isFinite(first)||!Number.isFinite(second)||
    Math.abs(first-second)>2000||first>now+60000||second>now+60000||
    now-second>15*60000)return fail('snapshot_version_mismatch');
 const categories={},available=new Set();
 for(const cat of NFL_SHARED_CATEGORIES){
  const source=Array.isArray(owner.categories?.[cat])?owner.categories[cat]:[];
  const approved=Array.isArray(published.categories?.[cat])?published.categories[cat]:[];
  const matching=new Map(source.map(item=>[key(item,cat),item]));
  const rows=[];
  for(const item of approved){
   const id=key(item,cat),raw=matching.get(id);
   // Never reconstruct an excluded or unseen player from a separate model.
   if(!raw)return fail('published_player_missing_in_owner_snapshot');
   const forecast=cat==='td'?item.modelChancePct:item.projection;
   if(!Number.isFinite(Number(forecast))||forecast===null)return fail('published_forecast_invalid');
   const offer=item.bookOffer?.attested===true?item.bookOffer:null;
   rows.push({...raw,projection:cat==='td'?raw.projection:Number(forecast),
    ...(cat==='td'?{modelTdPercent:Number(forecast)}:{}),
    bestBook:offer?{book:offer.book,odds:offer.odds}:null,
    edgeAnalytics:raw.edgeAnalytics?{...raw.edgeAnalytics,
     modelProjection:cat==='td'?raw.edgeAnalytics.modelProjection:Number(forecast),
     sportsbookLine:offer?.line??null,marketVerified:Boolean(offer)}:undefined});
   available.add(id);
  }
  categories[cat]=rows;
 }
 const rawTiers=Array.isArray(owner.sgps?.Analytics)?owner.sgps.Analytics:[];
 const tiers=[];
 for(const risk of NFL_SHARED_TIERS){
  const publishedTier=(published.modelResearchTiers||[]).find(t=>t?.risk===risk);
  if(publishedTier?.complete!==true)continue;
  const rawTier=rawTiers.find(t=>t?.risk===risk);
  const pLegs=publishedTier.legs||[],oLegs=rawTier?.legs||[];
  if(!rawTier||pLegs.length!==oLegs.length||!pLegs.length)continue;
  const grouped=new Map(oLegs.map(l=>[key(l,l.cat||l.category),l]));
  const legs=pLegs.map(l=>{
   const id=key(l,l.category),raw=grouped.get(id);
   if(!raw||!available.has(id))return null;
   return {...raw,projection:l.projection??raw.projection,
    modelTdPercent:l.modelChancePct??raw.modelTdPercent,
    projectionNote:l.projectionNote,parityApproved:true};
  });
  if(legs.some(l=>!l))continue;
  tiers.push({...rawTier,legs,modelOnly:true,publishable:false,
   combinedBookQuoteVerified:false,actualSgpOdds:null});
 }
 return{ok:true,status:'CURRENT',date:String(date),gameId:String(gameId),
  updatedAt:published.updatedAt,categories,tiers,bookParlays:
  Array.isArray(published.verifiedBookParlays)?published.verifiedBookParlays:[],
  publicResearchTiers:(published.modelResearchTiers||[]).filter(t=>t?.complete===true&&
   tiers.some(x=>x.risk===t.risk))};
}
