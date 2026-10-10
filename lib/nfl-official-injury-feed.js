// Read the NFL's week-wide official injury page once per week and match teams by
// canonical nickname. Do not infer game status from practice participation.
const ROOT='https://www.nfl.com/injuries/league';
const NICKNAMES={Cardinals:'ARI',Falcons:'ATL',Ravens:'BAL',Bills:'BUF',Panthers:'CAR',Bears:'CHI',Bengals:'CIN',Browns:'CLE',Cowboys:'DAL',Broncos:'DEN',Lions:'DET',Packers:'GB',Texans:'HOU',Colts:'IND',Jaguars:'JAX',Chiefs:'KC',Raiders:'LV',Chargers:'LAC',Rams:'LAR',Dolphins:'MIA',Vikings:'MIN',Patriots:'NE',Saints:'NO',Giants:'NYG',Jets:'NYJ',Eagles:'PHI',Steelers:'PIT','49ers':'SF',Seahawks:'SEA',Buccaneers:'TB',Titans:'TEN',Commanders:'WAS'};
const aliases={JAC:'JAX',WSH:'WAS',AZ:'ARI',LA:'LAR'};
export const nflCanonTeam=x=>aliases[String(x||'').toUpperCase()]||String(x||'').toUpperCase();
const strip=x=>String(x||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#(?:39|x27);/gi,"'").replace(/&nbsp;/gi,' ').replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(Number(d))).replace(/\s+/g,' ').trim();
const validStatuses=new Set(['OUT','DOUBTFUL','QUESTIONABLE','PROBABLE']);
const normalizeStatus=x=>{
 const s=String(x||'').trim().toUpperCase();
 return validStatuses.has(s)?s:null;
};
export function parseNflWeeklyInjuryHtml(html,{year,week,url}={}){
 if(typeof html!=='string'||html.length<500||!/<table/i.test(html))return null;
 const pieces=[...html.matchAll(/<div\s+class="d3-o-section-sub-title"[^>]*>\s*<span>([\s\S]*?)<\/span>/gi)];
 if(pieces.length<2)return null;
 const byTeam=new Map();
 for(let i=0;i<pieces.length;i++){
  const name=strip(pieces[i][1]),team=NICKNAMES[name];
  if(!team||byTeam.has(team))continue;
  const chunk=html.slice(pieces[i].index,pieces[i+1]?.index||html.length);
  const table=chunk.match(/<table\b[^>]*>[\s\S]*?<\/table>/i)?.[0]||'';
  const players=[],practiceOnly=[];
  if(table){
   for(const m of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(x=>strip(x[1]));
    if(cells.length<5)continue;
    const [player,position,injury,practiceStatus,gameStatus]=cells;
    if(!player||player==='Player')continue;
    const row={team,name:player,position,injury:injury||null,
      practiceStatus:practiceStatus||null,gameStatus:gameStatus||null};
    const status=normalizeStatus(gameStatus);
    if(status)players.push({...row,status});
    else if(practiceStatus)practiceOnly.push(row);
   }
  }
  // A team listed with "No Injuries Reported" is covered but is not proof
  // of an official game-day active list.
  byTeam.set(team,{team,players,practiceOnly,tablePresent:!!table,
    noInjuriesReported:/No Injuries Reported/i.test(chunk)});
 }
 if(byTeam.size<2)return null;
 return {year,week,url,teamCount:byTeam.size,teams:byTeam,source:'NFL.com league injury report',
  publishedAt:null,checkedAt:new Date().toISOString()};
}
const cache=new Map(),TTL=5*60*1000;
export async function nflOfficialWeeklyFromLeague({year,week,seasonType='REG',teams=[],fetcher=fetch}={}){
 const yr=Number(year),wk=Number(week),kind=String(seasonType||'REG').toUpperCase();
 if(!Number.isInteger(yr)||yr<2020||yr>2100||!Number.isInteger(wk)||wk<1||wk>22||
    !['REG','POST'].includes(kind))return null;
 const refs=teams.map(t=>nflCanonTeam(t.team?.abbreviation||t.abbr||t));
 if(refs.length!==2||refs.some(x=>!x))return null;
 const stage=kind==='POST'?'post':'reg',key=yr+'/'+stage+wk;
 let data=cache.get(key),now=Date.now();
 if(!data||now-data.at>TTL){
  const url=ROOT+'/'+yr+'/'+stage+wk;
  try{
   const r=await fetcher(url,{signal:AbortSignal.timeout(12000),headers:{accept:'text/html'}});
   if(!r.ok)throw Error('nfl_http_'+r.status);
   const html=await r.text();
   const parsed=parseNflWeeklyInjuryHtml(html,{year:yr,week:wk,url});
   if(!parsed)throw Error('nfl_weekly_html_unrecognized');
   data={at:now,parsed};cache.set(key,data);
  }catch(e){
   // fail closed; no data from a previous week can be reclassified as current.
   return {available:false,source:'NFL.com league injury report',url,error:String(e.message||e),year:yr,week:wk,teams:refs};
  }
 }
 const t=refs.map(x=>data.parsed.teams.get(x));
 if(t.some(x=>!x))return {available:false,source:data.parsed.source,url:data.parsed.url,error:'matchup_not_found_on_nfl_weekly_page',
  year:yr,week:wk,teams:refs,teamCount:data.parsed.teamCount};
 const names=t.flatMap(x=>x.players),practice=t.flatMap(x=>x.practiceOnly);
 return {available:true,year:yr,week:wk,teams:refs,entries:names,practiceEntries:practice,
  source:data.parsed.source,url:data.parsed.url,publishedAt:null,checkedAt:data.parsed.checkedAt,
  teamCount:data.parsed.teamCount,teamSectionsPresent:t.length,
  hasGameDesignations:names.length>0,practiceRows:practice.length,complete:true};
}
