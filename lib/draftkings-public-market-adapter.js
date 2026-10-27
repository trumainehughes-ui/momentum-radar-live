// DraftKings public-market normalization inspired by yzRobo/draftkings_api_explorer (MIT).
// Source: https://github.com/yzRobo/draftkings_api_explorer
// No market is considered available without a fresh, sourced response.
export const DK_NFL_LEAGUE_ID='88808';
export const DK_PUBLIC_BASE='https://sportsbook-nash.draftkings.com/api/sportscontent/dkusoh/v1';
export function draftKingsCategoryUrl({leagueId=DK_NFL_LEAGUE_ID,categoryId,subcategoryId}={}){
 const valid=x=>/^\d{1,12}$/.test(String(x||''));
 if(!valid(leagueId)||!valid(categoryId)||(subcategoryId&&!valid(subcategoryId)))throw Error('INVALID_MARKET_ID');
 return DK_PUBLIC_BASE+'/leagues/'+leagueId+'/categories/'+categoryId+(subcategoryId?'/subcategories/'+subcategoryId:'');
}
export function normalizeDraftKingsSelections(payload,{observedAt=new Date().toISOString(),categoryId,subcategoryId}={}){
 if(!payload||typeof payload!=='object'||!Array.isArray(payload.markets)||!Array.isArray(payload.selections))
  return {ok:false,error:'UNRECOGNIZED_DK_MARKET_SCHEMA',offers:[]};
 const markets=new Map(payload.markets.map(m=>[String(m.id),m]));
 const offers=payload.selections.flatMap(s=>{
  const market=markets.get(String(s.marketId));if(!market)return [];
  const odds=String(s.displayOdds?.american??'').replace(/−/g,'-').trim();
  if(!/^[+-]\d{2,5}$/.test(odds))return [];
  const label=String(s.label||s.name||'').trim();
  if(!label)return [];
  const rawLine=s.points??s.line??null;
  const line=rawLine!==null&&rawLine!==''&&Number.isFinite(Number(rawLine))?Number(rawLine):null;
  return [{source:'draftkings',marketId:String(market.id),selectionId:String(s.id||''),
   marketName:String(market.name||''),selectionLabel:label,line,americanOdds:odds,
   isMain:s.main===true,categoryId:String(categoryId||''),subcategoryId:String(subcategoryId||''),
   observedAt,sportsbookVerified:true}];
 });
 return {ok:true,offers,observedAt,source:'draftkings'};
}
