// Browser-side user-assisted sportsbook capture. No API, cookies or bot bypass.
export const CAPTURE_STORAGE_KEY='momentum-radar-public-book-observations-v1';
export const CAPTURE_MAX_AGE_MS=20*60*1000;
export const BOOK_DOMAINS=Object.freeze({
 FanDuel:['co.sportsbook.fanduel.com','sportsbook.fanduel.com'],
 DraftKings:['sportsbook.draftkings.com']
});
const marketNames=Object.freeze({rushing:'Rushing',passing:'Passing',receiving:'Receiving',receptions:'Receptions',td:'Anytime TD',points:'Points',rebounds:'Rebounds',assists:'Assists',threes:'Threes'});
const plain=s=>String(s||'').normalize('NFKC').replace(/[−–—]/g,'-').replace(/[\u00a0\u202f]/g,' ').replace(/\s+/g,' ').trim();
const escapeRe=s=>s.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
const canonicalName=s=>plain(s).toLowerCase().replace(/[^a-z0-9]/g,'');
export function validateBookPageUrl(sourceUrl,book){
 try{const u=new URL(sourceUrl);
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
   (BOOK_DOMAINS[book]||[]).includes(u.hostname.toLowerCase());
 }catch{return false;}
}
export function parseVisibleBookCapture({
 book,sourceUrl,text,date,gameId,homeName,awayName,homeAbbr,awayAbbr,players=[],
 observedAt=new Date().toISOString(),captureMethod='USER_PASTED_TEXT'
}={}){
 if(!validateBookPageUrl(sourceUrl,book))return {ok:false,reason:'source_is_not_official_sportsbook',offers:[]};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date))||
  !/^\d{7,12}$/.test(String(gameId))||!homeName||!awayName)
  return {ok:false,reason:'game_identity_missing',offers:[]};
 const at=Date.parse(observedAt);
 if(!Number.isFinite(at)||at>Date.now()+60000||Date.now()-at>CAPTURE_MAX_AGE_MS)
  return {ok:false,reason:'observation_time_invalid_or_stale',offers:[]};
 if(typeof text!=='string'||!text.trim()||text.length>240000)
  return {ok:false,reason:'visible_page_text_required',offers:[]};
 const normalized=plain(text),matchup=plain(awayName)+' @ '+plain(homeName);
 const roster=(Array.isArray(players)?players:[]).map(x=>({
  name:plain(typeof x==='string'?x:x?.name),
  team:plain(typeof x==='string'?'':x?.team).toUpperCase()
 })).filter(x=>x.name.length>=5&&x.name.length<70);
 const athletes=[...new Set(roster.map(x=>x.name))];
 const headerIndex=normalized.toLowerCase().indexOf(matchup.toLowerCase());
 // FanDuel player-detail screenshots show an athlete/ATL vs CHI plus the
 // alternate ladder, but may omit the full Bears @ Falcons header.
 // Accept that layout ONLY when athlete, roster team, opposing team and
 // visible alternate-market heading all agree with the selected matchup.
 const validTeams=new Set([plain(homeAbbr).toUpperCase(),plain(awayAbbr).toUpperCase()]);
 const playerModal=headerIndex>=0?null:roster.find(x=>{
  if(!x.team||!validTeams.has(x.team)||validTeams.size!==2)return false;
  const opponent=x.team===plain(homeAbbr).toUpperCase()?awayAbbr:homeAbbr;
  const playerAt=normalized.toLowerCase().indexOf(x.name.toLowerCase());
  const context=playerAt>=0?normalized.slice(playerAt,playerAt+300):'';
  return playerAt>=0&&new RegExp('\\b'+escapeRe(x.team)+'\\b','i').test(context)&&
   new RegExp('\\bvs\\s+'+escapeRe(String(opponent))+'\\b','i').test(normalized)&&
   /\bAlt\s+(Rushing|Passing|Receiving)\s+(Yds|Yards)\b/i.test(normalized);
 });
 if(headerIndex<0&&!playerModal)
  return {ok:false,reason:'game_header_not_found_in_page_text',offers:[]};
 const seen=new Set(),offers=[];
 const yardContext=/\b(?:Alt\s+)?Rushing\s+(?:Props Odds|Yds|Yards)\b/i.test(normalized)?'rushing':
  /\b(?:Alt\s+)?Passing\s+(?:Props Odds|Yds|Yards)\b/i.test(normalized)?'passing':
  /\b(?:Alt\s+)?Receiving\s+(?:Props Odds|Yds|Yards)\b/i.test(normalized)?'receiving':null;
 const segment=normalized.slice(headerIndex>=0?headerIndex:
  normalized.toLowerCase().indexOf(playerModal.name.toLowerCase()));
 const american=x=>{const s=plain(x),v=Number(s);
  return /^[+-]\d{2,5}$/.test(s)&&
   (v<=-100&&v>=-100000||v>=100&&v<=100000)?v:null;};
 const add=(player,category,line,raw)=>{
  const odds=american(raw);
  if(odds===null||!marketNames[category]||
    (category!=='td'&&(!Number.isFinite(Number(line))||Number(line)<=0)))return;
  const nline=category==='td'?null:Number(line),key=canonicalName(player)+'|'+category+'|'+nline;
  if(seen.has(key))return;seen.add(key);
  offers.push({book,gameId:String(gameId),date,player,
   category,market:marketNames[category],line:nline,odds,
   sourceUrl,observedAt,captureMethod,
   verification:'VISIBLE_BOOK_PAGE_USER_OBSERVATION_ONLY'});
 };
 for(const player of athletes){
  const nm=escapeRe(player);
  const regex=new RegExp('(?:^|\\s)'+nm+'\\s+(\\d{1,4}(?:\\.5)?)\\+\\s+(Rushing|Passing|Receiving)?\\s*(Yards?|Receptions?|Points?|Rebounds?|Assists?|Threes?)\\s*([+\\-]\\d{2,5})(?=\\s|$)','gi');
  for(const m of segment.matchAll(regex)){
   const stat=plain(m[3]).toLowerCase(),explicit=plain(m[2]).toLowerCase();
   const cat=stat.startsWith('yard')?(explicit||yardContext):
    stat.startsWith('reception')?'receptions':stat.startsWith('point')?'points':
    stat.startsWith('rebound')?'rebounds':stat.startsWith('assist')?'assists':
    stat.startsWith('three')?'threes':null;
   if(cat)add(player,cat,Number(m[1]),m[4]);
  }
  const tdRegex=new RegExp('(?:^|\\s)'+nm+'\\s+(?:Anytime\\s+(?:TD|Touchdown)(?:\\s+Scorer)?|To\\s+Score\\s+a\\s+Touchdown)\\s*([+\\-]\\d{2,5})(?=\\s|$)','gi');
  for(const m of segment.matchAll(tdRegex))add(player,'td',null,m[1]);
 }
 // FanDuel's player modal displays the name once and subsequent alternate
 // thresholds as compact numeric tiles: Alt Rushing Yds / 125+ / +300.
 // Never infer intermediate lines, and never include over/under 90.5
 // prices in an "at least" alternate ladder.
 if(playerModal){
  const section=/\bAlt\s+(Rushing|Passing|Receiving)\s+(?:Yds|Yards)\b/ig;
  const headings=[...segment.matchAll(section)];
  for(let i=0;i<headings.length;i++){
   const match=headings[i],cat=plain(match[1]).toLowerCase();
   const from=match.index+match[0].length;
   const next=headings[i+1]?.index??segment.length;
   const rest=segment.slice(from,next).split(/\bBetslip\b/i)[0];
   for(const row of rest.matchAll(/\b(\d{1,4}(?:\.5)?)\+\s*([+\-]\d{2,5})(?=\s|$)/g))
    add(playerModal.name,cat,Number(row[1]),row[2]);
  }
 }
 return {ok:true,reason:offers.length?'PUBLIC_SELECTIONS_OBSERVED':'NO_EXACT_MATCHING_PLAYER_PRICE_ROWS',
  offers:offers.slice(0,300),checkedAt:observedAt,book,
  gameId:String(gameId),date,captureMethod};
}
export function currentLocalBookOffers(data,gameId,now=Date.now()){
 if(!Array.isArray(data))return [];
 return data.filter(x=>String(x?.gameId)===String(gameId)&&
  validateBookPageUrl(x.sourceUrl,x.book)&&Number.isFinite(Date.parse(x.observedAt))&&
  now-Date.parse(x.observedAt)>=-60000&&
  now-Date.parse(x.observedAt)<=CAPTURE_MAX_AGE_MS&&
  Number.isFinite(Number(x.odds))&&(x.category==='td'||x.line!==null&&Number.isFinite(Number(x.line))));
}
