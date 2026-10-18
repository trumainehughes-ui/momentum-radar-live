// Read-only public odds observations. NEVER turn a web page quote into a
// sportsbook-issued correlated SGP price or a guaranteed bettable selection.
// The public DKN list is a sample of popular player props, not full coverage.
export const DKN_NFL_PROPS_URL='https://dknetwork.draftkings.com/draftkings-sportsbook-player-props/?tb_view=2';
export const FANDUEL_NFL_PUBLIC_URL='https://co.sportsbook.fanduel.com/football/nfl';
export const DRAFTKINGS_DIRECT_URL='https://sportsbook.draftkings.com/';
// Colorado's public storefront is JavaScript-rendered. This URL is a
// discovery entrypoint, not evidence of a parsed or verified prop price.
export const FANDUEL_CO_STOREFRONT_URL='https://co.sportsbook.fanduel.com/';
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
// The official DraftKings Network table links each observed price to an
// actual DraftKings Sportsbook selection. Capture that first-party event and
// outcome reference without claiming the book has accepted a live wager.
// It is a reader-facing deep link, NOT an authenticated correlated SGP quote.
export function draftKingsSportsbookSelectionLink(cellHtml){
 for(const anchor of String(cellHtml||'').matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)){
  const href=escDecode(anchor[1]).replace(/&amp;/g,'&');
  let url;
  try{url=new URL(href,'https://dknetwork.draftkings.com')}catch{continue}
  if(url.protocol!=='https:'||url.hostname!=='sportsbook.draftkings.com'||
    url.username||url.password||url.port)continue;
  const evt=url.pathname.match(/^\/event\/(?:[^/]+\/)?(\d{6,12})\/?$/i);
  const selection=url.searchParams.get('outcomes');
  if(!evt||!selection||!/^[a-zA-Z0-9]{8,40}$/.test(selection))continue;
  return {bookSelectionUrl:url.href,bookEventId:evt[1],
   bookSelectionId:selection};
 }
 return null;
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
  const rawCells=[...inner.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(m=>m[1]);
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
  const bookmakerLink=draftKingsSportsbookSelectionLink(rawCells[4]);
  matches.push({book:'DraftKings',publisher:'DraftKings Network',player,
   category:cat,market,odds,line,event,date,observedAt:new Date(now).toISOString(),
   sourceUrl:DKN_NFL_PROPS_URL,...(bookmakerLink||{}),
   verification:'PUBLIC_PAGE_OBSERVATION_ONLY'});
 }
 return matches.slice(0,100);
}

// Extract ONLY rendered, visible public FanDuel rushing props for the
// SPECIFIC verified matchup. This parser never executes script payloads,
// extrapolates alternate lines, or confuses individual odds with SGP quotes.
// A JavaScript app shell without visible markets correctly returns [].
export function parseFanDuelVisibleNflRushingProps(html,{
 date,homeName,awayName,now=Date.now()
}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))||
    !homeName||!awayName||!Number.isFinite(now))return [];
 const visible=escDecode(String(html||'')
  .replace(/<script\b[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi,' '));
 const header=(String(awayName)+' @ '+String(homeName)+' Rushing Props Odds')
  .replace(/\s+/g,' ').trim();
 const at=visible.toLowerCase().indexOf(header.toLowerCase());
 if(at<0)return [];
 const next=visible.slice(at+header.length,at+header.length+15000);
 const stop=next.search(/\b(?:NFL|Football)\s*\/\s*NFL\s*\/|\b(?:Passing|Rushing|Receiving|Receptions|Anytime Touchdown) Props Odds\b/i);
 const scoped=stop>=0?next.slice(0,stop):next;
 const result=[],seen=new Set();
 const pattern=/\b([\p{L}][\p{L}\p{M}.'’\-]+(?:\s+[\p{L}][\p{L}\p{M}.'’\-]+){1,2})\s+(\d{1,3}(?:\.5)?)\+\s+Yards?\s+([+\-−–—]\d{2,5})\b/gu;
 for(const match of scoped.matchAll(pattern)){
  const player=match[1].trim(),line=Number(match[2]),odds=validOdds(match[3]);
  if(!Number.isFinite(line)||line<=0||odds===null)continue;
  const key=normalize(player)+'|'+line;
  if(seen.has(key))continue;seen.add(key);
  result.push({book:'FanDuel',publisher:'FanDuel Sportsbook',player,
   category:'rushing',market:player+' Rushing Yards',
   odds,line,date,observedAt:new Date(now).toISOString(),
   sourceUrl:FANDUEL_NFL_PUBLIC_URL,
   verification:'PUBLIC_PAGE_OBSERVATION_ONLY'});
  if(result.length>=100)break;
 }
 return result;
}

// Safely extract additional market categories ONLY when the first-party
// FanDuel page exposes complete, visible player/line/price rows. Never read
// embedded JS/app state, never synthesize alternates, and never treat these
// observations as bookmaker-issued SGP quotes.
export function parseFanDuelVisibleNflPlayerProps(html,{
 date,homeName,awayName,now=Date.now()
}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))||
  !homeName||!awayName||!Number.isFinite(now))return [];
 const visible=escDecode(String(html||'')
  .replace(/<script\b[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi,' '));
 const matchup=(String(awayName)+' @ '+String(homeName)).replace(/\s+/g,' ').trim();
 const definitions=[
  ['passing','Passing Props Odds','Yards'],
  ['receiving','Receiving Props Odds','Yards'],
  ['receptions','Receptions Props Odds','Receptions'],
  ['td','Anytime Touchdown Odds',null]
 ];
 const collected=parseFanDuelVisibleNflRushingProps(html,
  {date,homeName,awayName,now});
 const seen=new Set(collected.map(x=>normalize(x.player)+'|'+x.category+'|'+x.line));
 for(const [category,headerSuffix,unit] of definitions){
  const header=matchup+' '+headerSuffix;
  const start=visible.toLowerCase().indexOf(header.toLowerCase());
  if(start<0)continue;
  const next=visible.slice(start+header.length,start+header.length+15000);
  // Prevent another game or market panel from leaking into the selected game.
  const stop=next.search(/\b(?:NFL|Football)\s*\/\s*NFL\s*\/|\b(?:Passing|Rushing|Receiving|Receptions|Anytime Touchdown) Props Odds\b/i);
  const scoped=stop>=0?next.slice(0,stop):next;
  const yardPattern=/\b([\p{L}][\p{L}\p{M}.'’\-]+(?:\s+[\p{L}][\p{L}\p{M}.'’\-]+){1,2})\s+(\d{1,3}(?:\.5)?)\+\s+(Yards|Receptions)\s+([+\-−–—]\d{2,5})\b/gu;
  const tdPattern=/\b([\p{L}][\p{L}\p{M}.'’\-]+(?:\s+[\p{L}][\p{L}\p{M}.'’\-]+){1,2})\s+Anytime\s+(?:TD|Touchdown)(?:\s+Scorer)?\s+([+\-−–—]\d{2,5})\b/gu;
  for(const match of scoped.matchAll(category==='td'?tdPattern:yardPattern)){
   const player=match[1].trim();
   if(category!=='td'&&match[3]!==unit)continue;
   const line=category==='td'?null:Number(match[2]);
   const odds=validOdds(category==='td'?match[2]:match[4]);
   if(odds===null||(category!=='td'&&(!Number.isFinite(line)||line<=0)))continue;
   const key=normalize(player)+'|'+category+'|'+line;
   if(seen.has(key))continue;
   seen.add(key);
   collected.push({book:'FanDuel',publisher:'FanDuel Sportsbook',player,
    category,market:player+' '+headerSuffix,odds,line,date,
    observedAt:new Date(now).toISOString(),sourceUrl:FANDUEL_NFL_PUBLIC_URL,
    verification:'PUBLIC_PAGE_OBSERVATION_ONLY'});
   if(collected.length>=100)return collected;
  }
 }
 return collected;
}

export function publicBookResearchReport({dkHtml,dkStatus,fdHtml,fdStatus,
 date,home,away,homeName,awayName,now=Date.now()}={}){
 const dkOffers=typeof dkHtml==='string'?
  parseDraftKingsNetworkNflProps(dkHtml,{date,home,away,now}):[];
 const fdOffers=typeof fdHtml==='string'?
  parseFanDuelVisibleNflPlayerProps(fdHtml,{date,homeName,awayName,now}):[];
 const offers=[...dkOffers,...fdOffers];
 const status=offers.length?'PUBLIC_OFFERS_OBSERVED':
  dkStatus==='FETCH_OK'||fdStatus==='FETCH_OK'?'NO_MATCHING_PUBLIC_PROPS':'PUBLIC_PAGE_UNAVAILABLE';
 return{ok:true,date,home,away,status,offers,
  books:[{book:'DraftKings',status:dkOffers.length?'PUBLIC_LISTINGS_OBSERVED':
    dkStatus||'SOURCE_NOT_READABLE',observedOffers:dkOffers.length,
    sourceUrl:DKN_NFL_PROPS_URL},
   {book:'FanDuel',status:fdOffers.length?'PUBLIC_LISTINGS_OBSERVED':
    fdStatus||'NO_MACHINE_READABLE_MARKETS',observedOffers:fdOffers.length,
    sourceUrl:FANDUEL_NFL_PUBLIC_URL}],
  combinedSgpQuoteVerified:false,verifiedBettableOffers:0,
  note:'Only odds observed directly in the public page are shown, never inferred from another book or model. They are timestamped individual market observations, not a sportsbook-accepted correlated SGP quote. A JavaScript-only app shell provides no priced selection evidence.'};
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

/**
 * Publicly observed prices are corroborating participation signals, not
 * official active-list confirmations or sportsbook-issued SGP quotes.
 * A missing listing never means the athlete is out.
 */
export function publicNflOfferParticipationSignals(offers,{gameId,now=Date.now(),maxAgeMs=20*60*1000}={}){
 const id=String(gameId||''),signals=new Map();
 for(const offer of Array.isArray(offers)?offers:[]){
  if(String(offer?.gameId||'')!==id||offer?.rosterMatched!==true)continue;
  if(!['DraftKings','FanDuel'].includes(offer.book))continue;
  const observed=Date.parse(offer.observedAt||'');
  if(!Number.isFinite(observed)||observed>now+60000||now-observed>maxAgeMs)continue;
  if(!Number.isFinite(Number(offer.odds))||!offer.player||!offer.team)continue;
  const key=normalize(offer.player)+'|'+normalize(offer.team);
  const prior=signals.get(key)||{player:offer.player,team:offer.team,gameId:id,
   participationEvidence:'PUBLIC_PROP_LISTED_NOT_OFFICIAL_ACTIVE',
   sportsbookSources:[],marketCategories:[],latestObservedAt:null,
   officialStatusVerified:false};
  if(!prior.sportsbookSources.includes(offer.book))prior.sportsbookSources.push(offer.book);
  if(!prior.marketCategories.includes(offer.category))prior.marketCategories.push(offer.category);
  if(!prior.latestObservedAt||observed>Date.parse(prior.latestObservedAt))
   prior.latestObservedAt=offer.observedAt;
  signals.set(key,prior);
 }
 return [...signals.values()];
}
