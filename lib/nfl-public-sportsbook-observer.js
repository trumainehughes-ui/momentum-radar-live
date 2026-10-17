// Read-only public odds observations. NEVER turn a web page quote into a
// sportsbook-issued correlated SGP price or a guaranteed bettable selection.
// The public DKN list is a sample of popular player props, not full coverage.
export const DKN_NFL_PROPS_URL='https://dknetwork.draftkings.com/draftkings-sportsbook-player-props/?tb_view=2';
export const FANDUEL_NFL_PUBLIC_URL='https://sportsbook.fanduel.com/football/nfl';
const ABBR_ALIASES={LA:['LAR','LAC'],JAX:['JAX'],KC:['KC'],NO:['NO'],
 NY:['NYG','NYJ'],NE:['NE'],TB:['TB'],LV:['LV'],GB:['GB'],
 SF:['SF'],WSH:['WSH']};
const normalize=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const escDecode=s=>String(s||'')
 .replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&')
 .replace(/&minus;|&#8722;|&#x2212;/gi,'−')
 .replace(/&#(\d+);/g,(_,a)=>String.fromCodePoint(Number(a)))
 .replace(/&[a-z]+;/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const validOdds=s=>{
 const x=String(s||'').replace(/[−–—]/g,'-').replace(/\s/g,'');
 if(!/^[+-]\d{2,5}$/.test(x))return null;
 const n=Number(x);return Number.isSafeInteger(n)&&Math.abs(n)>=100&&Math.abs(n)<=100000?n:null;
};
function categoryFor(market){
 const m=String(market||'').toLowerCase();
 if(/anytime (?:td|touchdown)(?: scorer)?/.test(m))return 'td';
 if(/passing yards?/.test(m))return 'passing';
 if(/rushing yards?/.test(m))return 'rushing';
 if(/receiving yards?/.test(m))return 'receiving';
 if(/receptions?/.test(m))return 'receptions';
 return null;
}
function teamMatch(label,team){
 const n=normalize(label);
 const a=normalize(team);
 if(n===a)return true;
 if(n==='LA'&&['LAR','LAC'].includes(a))return true;
 return (ABBR_ALIASES[n]||[]).includes(a);
}
function eventTeams(event){
 const raw=String(event||''),parts=raw.split(/\s+@\s+/);
 if(parts.length!==2)return null;
 const away=parts[0].match(/^\s*([A-Z]{2,3})\s+/)?.[1];
 const home=parts[1].match(/^\s*([A-Z]{2,3})\s+/)?.[1];
 return away&&home?{away,home}:null;
}
function dateMatch(display,date){
 const m=String(display||'').match(/\b(\d{1,2})\/(\d{1,2})\b/);
 if(!m)return false;
 const d=String(date||'').split('-').map(Number);
 return d.length===3&&d[1]===Number(m[1])&&d[2]===Number(m[2]);
}
function parseCells(row){
 return [...row.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)]
  .map(m=>escDecode(m[1]));
}
function explicitMarketPlayer(market,betLine,cat){
 if(cat==='td')return betLine;
 const m=String(market||'');
 return m.replace(/\s+(Passing|Rushing|Receiving)\s+Yards.*$/i,'')
  .replace(/\s+Receptions?.*$/i,'').trim();
}
export function parseDraftKingsNetworkNflProps(html,{date,home,away,now=Date.now()}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))||!home||!away)
  throw Error('invalid_game_scope');
 if(!Number.isFinite(now))throw Error('invalid_observation_time');
 const source=String(html||'');
 // Never parse unrelated snippets, widget code or unverified JSON embedded in
 // scripts as book prices; accept visible table cells only.
 const noScripts=source.replace(/<script\b[\s\S]*?<\/script>/gi,'')
  .replace(/<style\b[\s\S]*?<\/style>/gi,'');
 const rows=[...noScripts.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
 const matches=[],seen=new Set();
 for(const [,inner] of rows.slice(0,700)){
  const cells=parseCells(inner);
  if(cells.length<5)continue;
  const [event,eventDate,market,betLine,oddsText]=cells;
  if(!dateMatch(eventDate,date))continue;
  const teams=eventTeams(event);
  if(!teams||!teamMatch(teams.home,home)||!teamMatch(teams.away,away))
   continue;
  // LA event abbreviations may be shared by LA teams; require the team
  // nickname when ambiguous to avoid cross-game attribution.
  if(teams.away==='LA'&&!/\b(?:Chargers|Rams)\b/i.test(event))
   continue;
  const cat=categoryFor(market),odds=validOdds(oddsText);
  if(!cat||odds===null)continue;
  const player=explicitMarketPlayer(market,betLine,cat);
  if(!/^[\p{L}\p{M}\p{N} .'-]{4,90}$/u.test(player)||/\b(?:under|over)\b/i.test(player))
   continue;
  const line=cat==='td'?null:Number(String(betLine).match(/^(\d+(?:\.\d+)?)\+/)?.[1]);
  if(cat!=='td'&&(!Number.isFinite(line)||line<=0))continue;
  const key=normalize(player)+'|'+cat+'|'+String(line);
  if(seen.has(key))continue;seen.add(key);
  matches.push({book:'DraftKings',publisher:'DraftKings Network',player,
   category:cat,market,odds,line,event,date,observedAt:new Date(now).toISOString(),
   sourceUrl:DKN_NFL_PROPS_URL,verification:'PUBLIC_PAGE_OBSERVATION_ONLY'});
 }
 return matches.slice(0,100);
}
export function publicBookResearchReport({dkHtml,dkStatus,fdStatus,date,
 home,away,now=Date.now()}={}){
 const offers=typeof dkHtml==='string'?
  parseDraftKingsNetworkNflProps(dkHtml,{date,home,away,now}):[];
 const status=offers.length?'PUBLIC_OFFERS_OBSERVED':
  dkStatus==='FETCH_OK'?'NO_MATCHING_PUBLIC_PROPS':'PUBLIC_PAGE_UNAVAILABLE';
 return{ok:true,date,home,away,status,offers,
  books:[{book:'DraftKings',status:offers.length?'PUBLIC_LISTINGS_OBSERVED':
    dkStatus||'SOURCE_NOT_READABLE',observedOffers:offers.length,
    sourceUrl:DKN_NFL_PROPS_URL},
   {book:'FanDuel',status:fdStatus||'NO_MACHINE_READABLE_MARKETS',
    observedOffers:0,sourceUrl:FANDUEL_NFL_PUBLIC_URL}],
  combinedSgpQuoteVerified:false,verifiedBettableOffers:0,
  note:'These are public page observations, NOT authenticated live sportsbook selections or combined SGP odds. The DraftKings Network page lists popular props, not all market offerings; odds can change. FanDuel prices are never inferred from DraftKings.'};
}

export function matchPublicOffersToEligibleGamePlayers(offers,publicGame,{home,away}={}){
 const allowed=new Set([normalize(home),normalize(away)]);
 const vetted=new Map();
 if(!['CURRENT','LAST_SAVED'].includes(publicGame?.status))return [];
 for(const [cat,rows] of Object.entries(publicGame?.categories||{})){
  for(const p of Array.isArray(rows)?rows:[]){
   if(allowed.has(normalize(p?.team))&&p?.name){
    const id=normalize(p.name)+'|'+cat;
    vetted.set(id,p);
   }
  }
 }
 return(Array.isArray(offers)?offers:[]).flatMap(x=>{
  const player=vetted.get(normalize(x.player)+'|'+x.category);
  if(!player)return [];
  const team=normalize(player.team);
  if(!allowed.has(team))return [];
  return [{...x,team:player.team,playerID:String(player.playerID||player.playerId||''),
   gameId:String(publicGame.gameId||''),rosterMatched:true}];
 });
}
