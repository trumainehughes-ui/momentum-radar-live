// Persistent two-book coverage audit for every match, independent of
// whether a four/five/seven-leg SGP model can be built. This records actual
// source availability rather than pretending the public page exposes all
// possible markets, and never implies an SGP combined price.
const BOOKS=['DraftKings','FanDuel'],CATS=['td','passing','rushing','receiving','receptions'];
const good=x=>x?.available!==false&&x?.odds!==null&&
 x?.odds!==undefined&&x?.odds!==''&&Number.isFinite(Number(x.odds))&&
 Number(x.odds)!==0;
const clean=x=>String(x??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function sportsbookCoverageAudit(rows,{
 gameId,league='nfl',source='Unknown',checkedAt=new Date().toISOString()
}={}){
 const out=BOOKS.map(book=>{
  const listed=[],players=new Set(),seen=new Set();
  const categories=Object.fromEntries(CATS.map(x=>[x,0]));
  for(const m of Array.isArray(rows)?rows:[]){
   if(gameId&&String(m?.eventID)!==String(gameId))continue;
   if(m?.periodID!=='game')continue;
   const cat=String(m?.cat||m?.category||'').toLowerCase();
   if(!CATS.includes(cat)||cat==='td'&&
     !(m.betTypeID==='yn'&&m.sideID==='yes')||
      cat!=='td'&&!(m.betTypeID==='ou'&&m.sideID==='over'))continue;
   const id=String(m.playerID||'').trim(),name=clean(m.name);
   if(!id||!name)continue;
   for(const offer of m?.books||[]){
    if(offer?.book!==book||!good(offer))continue;
    const line=cat==='td'?'Anytime TD':String(offer.line??'');
    if(cat!=='td'&&(!line||!/^(?:\d+(?:\.\d+)?\+?)$/.test(line)))continue;
    const key=id+'|'+cat+'|'+line+'|'+Number(offer.odds);
    if(seen.has(key))continue;
    seen.add(key);players.add(id);categories[cat]++;
    listed.push({category:cat,playerID:id,book,odds:Number(offer.odds),
     line,alt:offer.alt===true});
   }
  }
  return{book,status:listed.length?'BOOK_INDIVIDUAL_PROPS_PRICED':'BOOK_PRICES_NOT_OBSERVED',
   pricedSelections:listed.length,uniquePlayers:players.size,
   categories,pricedAlternateSelections:listed.filter(x=>x.alt).length,
   missingCategories:CATS.filter(x=>categories[x]===0),
   hasEveryRequiredFootballStat:CATS.every(x=>categories[x]>0),
   fullyVerifiedSportsbookCatalog:false,
   bookCombinedSgpQuoteVerified:false};
 });
 return{league,gameId:String(gameId||''),source,checkedAt,
  books:Object.fromEntries(out.map(x=>[x.book,x])),
  bothBooksAudited:true,bothBooksObservedPriced:out.every(x=>x.pricedSelections>0),
  completeAllPublicStatsCoverage:false,
  note:'Each book checked independently from the available market feed. No data does not authorize filling in a price. Public webpage research may show other odds but does not establish authenticated current selection or combined SGP availability.'};
}
