// Read-only DraftKings Network NBA "most bet" market observations.
// NOT sportsbook authenticated odds, an exhaustive market feed, or SGP quotes.
export const NBA_DKN_LISTINGS='https://dknetwork.draftkings.com/draftkings-sportsbook-player-props/?tb_view=2';
export const NBA_FANDUEL_PUBLIC='https://sportsbook.fanduel.com/basketball/nba';
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const plain=s=>String(s||'').replace(/<[^>]*>/g,' ')
 .replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&')
 .replace(/&minus;|&#8722;|&#x2212;/gi,'-')
 .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
 .replace(/\s+/g,' ').trim();
const categoryMap=[
 ['pra',/(?:points?\s*\+\s*rebounds?\s*\+\s*assists?|pts?\s*\+\s*rebs?\s*\+\s*asts?|(?:PRA))\b/i],
 ['threes',/(?:3[\s-]*pointers?|3pts?|three[\s-]*pointers?|made[\s-]*threes?|3PM)\b/i],
 ['points',/\b(?:points?|pts?)\b/i],
 ['rebounds',/\b(?:rebounds?|rebs?)\b/i],
 ['assists',/\b(?:assists?|asts?)\b/i]
];
const category=market=>categoryMap.find(([,re])=>re.test(market))?.[0]||null;
function oddsNumber(raw){
 const str=String(raw||'').replace(/[−–—]/g,'-').replace(/\s/g,'');
 if(!/^[+-]\d{2,5}$/.test(str))return null;
 const n=Number(str);
 return Math.abs(n)>=100&&Math.abs(n)<=100000?n:null;
}
function dateMatches(raw,date){
 const m=String(raw||'').match(/\b(\d{1,2})\/(\d{1,2})\b/);
 return Boolean(m&&Number(m[1])===Number(date.slice(5,7))&&
  Number(m[2])===Number(date.slice(8,10)));
}
function teamMatch(part,team){
 const raw=norm(part),abbr=norm(team?.abbr);
 const tokens=String(team?.name||'').split(/\s+/).filter(Boolean);
 const nick=norm(tokens.slice(-1)[0]);
 return Boolean(raw&&nick&&raw.includes(nick)&&
  (raw.startsWith(abbr)||raw.endsWith(nick)||
   raw.includes(norm(tokens.slice(-2).join('')))));
}
function visibleCells(html){
 const clean=String(html||'').replace(/<script\b[\s\S]*?<\/script>/gi,'')
  .replace(/<style\b[\s\S]*?<\/style>/gi,'');
 return [...clean.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
 .slice(0,1000).map(([,row])=>[...row.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)]
 .map(([,v])=>plain(v))).filter(x=>x.length>=5);
}
function pickPlayer(market,betLine,cat){
 const regex=cat==='pra'?/\s+(?:points?\s*\+\s*rebounds?\s*\+\s*assists?|pts?\s*\+\s*rebs?\s*\+\s*asts?|PRA)\b.*/i:
  cat==='threes'?/\s+(?:3[\s-]*pointers?|3pts?|three[\s-]*pointers?|made[\s-]*threes?|3PM)\b.*/i:
  new RegExp('\\s+(?:'+cat+')\\b.*','i');
 const name=String(market||'').replace(regex,'').trim();
 return name&&name!==market?name:null;
}
function selection(raw){
 const text=String(raw||'').trim();
 const m=text.match(/^(Over|Under)\s*(\d+(?:\.\d+)?)$/i);
 if(m)return {side:m[1].toUpperCase(),line:Number(m[2])};
 const n=text.match(/^(\d+(?:\.\d+)?)\+$/);
 return n?{side:'AT_LEAST',line:Number(n[1])}:null;
}
export function parseNbaDkPublicProps(html,{date,game,now=Date.now()}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))||
  !game?.home?.name||!game?.away?.name||!Number.isFinite(now))
  throw Error('invalid_nba_public_scope');
 const rows=visibleCells(html),out=[],seen=new Set();
 for(const [event,day,market,betLine,rawOdds] of rows){
  if(!dateMatches(day,date))continue;
  const pair=event.split(/\s+@\s+/);
  if(pair.length!==2||!teamMatch(pair[0],game.away)||!teamMatch(pair[1],game.home))continue;
  const cat=category(market),odd=oddsNumber(rawOdds),sel=selection(betLine);
  const name=cat&&pickPlayer(market,betLine,cat);
  if(!cat||odd===null||!sel||!name||!(/^[\p{L}\p{M}\p{N} .'-]{4,85}$/u).test(name))continue;
  const key=norm(name)+'|'+cat+'|'+sel.side+'|'+sel.line;
  if(seen.has(key))continue;seen.add(key);
  out.push({player:name,category:cat,side:sel.side,line:sel.line,odds:odd,
   book:'DraftKings',publisher:'DraftKings Network',gameId:String(game.gameId),
   sourceUrl:NBA_DKN_LISTINGS,observedAt:new Date(now).toISOString(),
   verification:'PUBLIC_PAGE_OBSERVATION_ONLY'});
 }
 return out.slice(0,80);
}
export function onlyKnownNbaPlayers(offers,gameReport,game){
 if(gameReport?.ok!==true||String(gameReport.gameId)!==String(game.gameId)||
  gameReport.status!=='SCHEDULED'||gameReport.pregameReadiness?.freshness!=='CURRENT')return[];
 const teamNames=new Set([norm(game.home?.abbr),norm(game.away?.abbr)]);
 const allowed=new Set();
 for(const tier of gameReport.sgps||[])if(tier.status==='MODEL_CANDIDATE'){
  for(const leg of tier.legs||[]){
   if(!leg.name||!teamNames.has(norm(leg.team))||String(leg.gameId)!==String(game.gameId))continue;
   if(leg.starterStatus==='OUT'||leg.starterVerified===false&&leg.availability==='INACTIVE')continue;
   allowed.add(norm(leg.name)+'|'+leg.category);
  }
 }
 return (offers||[]).filter(x=>allowed.has(norm(x.player)+'|'+x.category));
}
export function onlyRosterListedNbaOffers(offers,{home,away,rosters=[],injuries=[]}={}){
 const allowedTeams=new Set([norm(home?.abbr),norm(away?.abbr)]);
 const rostered=new Set();
 for(const item of rosters){
  if(!allowedTeams.has(norm(item?.team)))continue;
  const sections=Array.isArray(item?.data?.athletes)?item.data.athletes:[];
  for(const section of sections)for(const a of section?.items||section?.athletes||[section]){
   const player=a.athlete||a;
   const name=player?.displayName||player?.fullName||a.displayName;
   const st=String(player?.status?.name||player?.status?.type||'').toLowerCase();
   if(name&&(st===''||st==='active'))rostered.add(norm(name));
  }
 }
 const withheld=new Set((injuries||[]).filter(x=>
  /\b(?:OUT|INACTIVE|DOUBTFUL|SUSPENDED|INJURED RESERVE)\b/i.test(String(x?.status||'')))
  .map(x=>norm(x.name)));
 return (offers||[]).filter(x=>rostered.has(norm(x.player))&&!withheld.has(norm(x.player)));
}
