// A single source of truth for customer-facing NFL projections on BOTH
// sites. The signed /api/public-nfl-game response is the injury/role-screened
// published game snapshot. Owner-only market diagnostics remain separate.
export const NFL_SHARED_CATEGORIES=Object.freeze(['td','passing','rushing','receiving','receptions']);
export const NFL_SHARED_TIERS=Object.freeze(['Small','Medium','Nuke']);
const canonical=x=>String(x??'').trim().toUpperCase();
const key=(x,cat)=>[canonical(x?.name||x?.player),canonical(x?.team),cat].join('|');
const millis=x=>Date.parse(String(x||''));
export function ownerNflPublishedParity(owner,published,{date,gameId,now=Date.now()}={}){
 const empty=()=>({ok:false,status:'NOT_SYNCED',gameId:String(gameId||''),
  date:String(date||''),categories:Object.fromEntries(
   NFL_SHARED_CATEGORIES.map(cat=>[cat,[]])),tiers:[],bookParlays:[],publicResearchTiers:[]});
 const fail=reason=>({...empty(),reason});
 // Never use an unverified raw market response as a fallback for customer
 // projections. The public response alone decides visible player eligibility.
 if(!published?.ok||published.status!=='CURRENT'||
    published.updatedDataCurrent!==true)return fail('publication_not_current');
 if(String(published.gameId)!==String(gameId)||
    String(published.date)!==String(date)||
    !/^[A-Z]{2,4}$/.test(String(published.home||''))||
    !/^[A-Z]{2,4}$/.test(String(published.away||''))||
    published.home===published.away)return fail('game_or_team_mismatch');
 const at=millis(published.updatedAt);
 if(!Number.isFinite(at)||at>now+60000||now-at>15*60000)
  return fail('published_snapshot_expired');
 // Owner market diagnostics may be behind by up to 15m in browser cache.
 // Never let that gap override or block a CURRENT published public projection.
 const rawAt=millis(owner?.fetchedAt);
 const sameRaw=owner?.ok===true&&String(owner.date)===String(date)&&
  String(owner.gameId)===String(gameId)&&
  owner.home===published.home&&owner.away===published.away&&
  Number.isFinite(rawAt)&&Math.abs(rawAt-at)<=2000;
 const teams=new Set([published.home,published.away]);
 const categories={},available=new Set();
 for(const cat of NFL_SHARED_CATEGORIES){
  const approved=Array.isArray(published.categories?.[cat])?published.categories[cat]:[];
  const raw=Array.isArray(owner?.categories?.[cat])?owner.categories[cat]:[];
  const matching=sameRaw?new Map(raw.map(item=>[key(item,cat),item])):new Map();
  const rows=[];
  for(const item of approved){
   const id=key(item,cat);
   if(!canonical(item?.name)||!teams.has(item?.team)||available.has(id))
    return fail('published_player_identity_invalid');
   const value=cat==='td'?item.modelChancePct:item.projection;
   if(value===null||value===undefined||!Number.isFinite(Number(value))||
      Number(value)<=0)return fail('published_forecast_invalid');
   const rawRow=matching.get(id);
   // Raw analytics enrich the display ONLY if the saved version matches.
   // They never introduce additional people, lines or different projections.
   const offer=item.bookOffer?.attested===true?item.bookOffer:null;
   const src=sameRaw&&rawRow?rawRow:{};
   rows.push({...src,
    playerID:src.playerID||src.playerId||null,eventID:String(gameId),
    name:item.name,team:item.team,category:cat,position:item.position||src.position||null,
    // Published role/production statistics, not stale owner market cache,
    // are authoritative for both customer and owner matchup explanations.
    starterVerified:item.starterVerified===true,
    gameSample:Number.isSafeInteger(Number(item.gameSample))&&Number(item.gameSample)>=2?
     Number(item.gameSample):null,
    avgPerGame:item.avgPerGame!==null&&item.avgPerGame!==undefined&&
     Number.isFinite(Number(item.avgPerGame))&&Number(item.avgPerGame)>0?
     Number(item.avgPerGame):null,
    range:item.range&&item.range.floor!==null&&item.range.floor!==undefined&&
     item.range.ceiling!==null&&item.range.ceiling!==undefined&&
     Number.isFinite(Number(item.range.floor))&&Number.isFinite(Number(item.range.ceiling))?
     {floor:Number(item.range.floor),ceiling:Number(item.range.ceiling)}:null,
    recentFive:Array.isArray(item.recentFive)?
     item.recentFive.filter(v=>Number.isFinite(Number(v))).slice(-5).map(Number):[],
    projection:cat==='td'?'Anytime TD':Number(value),
    modelTdPercent:cat==='td'?Number(value):undefined,
    reason:item.projectionNote||'Published matchup research',
    analyticsOnly:true,books:offer?[offer]:[],
    bestBook:offer?{book:offer.book,odds:offer.odds}:null,
    edgeAnalytics:{modelProjection:cat==='td'?null:Number(value),
     sportsbookLine:offer?.line??null,marketVerified:Boolean(offer)}});
   available.add(id);
  }
  categories[cat]=rows;
 }
 const tiers=[],publicResearchTiers=[];
 const rawTiers=sameRaw&&Array.isArray(owner.sgps?.Analytics)?owner.sgps.Analytics:[];
 for(const risk of NFL_SHARED_TIERS){
  const card=(Array.isArray(published.modelResearchTiers)?published.modelResearchTiers:[])
   .find(t=>t?.risk===risk);
  if(card?.complete!==true||!Array.isArray(card.legs)||!card.legs.length)
   continue;
  const seen=new Set();
  const legs=card.legs.map(l=>{
   const id=key(l,l?.category);
   if(seen.has(id)||!available.has(id))return null;
   seen.add(id);
   return {...l,player:l.player||l.name,parityApproved:true};
  });
  if(legs.some(l=>!l))continue;
  publicResearchTiers.push({...card,legs});
  const orig=rawTiers.find(t=>t.risk===risk);
  tiers.push({risk,mode:'MODEL_ONLY',legs:legs.map(l=>({
    player:l.player,name:l.player,team:l.team,cat:l.category,
    projection:l.projection,modelTdPercent:l.modelChancePct,
    reason:l.projectionNote,eventID:String(gameId)})),
   requiredLegs:card.requiredLegs,tierAssessment:{compositionOk:true},
   explanation:orig?.explanation,modelOnly:true,publishable:false,
   combinedBookQuoteVerified:false,actualSgpOdds:null});
 }
 return {ok:true,status:'CURRENT',date:String(date),gameId:String(gameId),
  updatedAt:published.updatedAt,diagnosticSnapshotMatches:sameRaw,
  categories,tiers,bookParlays:Array.isArray(published.verifiedBookParlays)?
   published.verifiedBookParlays:[],publicResearchTiers};
}
