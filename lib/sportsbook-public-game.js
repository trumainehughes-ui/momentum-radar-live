// Automatic official, published-page discovery from VERIFIED ESPN game teams.
// A candidate URL is checked and may fail; it is not proof the sportsbook
// actually lists today's game or every player/alternate.
import {officialSportsbookPublicPage} from './sportsbook-public-links.js';
import {inspectPublishedSportsbookPage} from './public-sportsbook-reader.js';
const cleanName=x=>String(x||'').normalize('NFKD')
 .replace(/[\u0300-\u036f]/g,'').toLowerCase()
 .replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-')
 .replace(/^-+|-+$/g,'').slice(0,65);
export const PUBLIC_GAME_PAGE_TYPES=['FanDuel Home','FanDuel Away','DraftKings Public Props'];
export function officialPublicGamePages({league,home,away}={}){
 const sport=String(league||'').toLowerCase();
 if(!['nfl','nba'].includes(sport))return[];
 const teamNames=[['FanDuel Home',home],['FanDuel Away',away]];
 const candidates=teamNames.flatMap(([label,team])=>{
  const slug=cleanName(team),url='https://sportsbook.fanduel.com/teams/'+sport+'/'+slug+'/odds';
  const page=slug?officialSportsbookPublicPage(url):null;
  return page?[{label,book:'FanDuel',...page,url:page.url}]:[];
 });
 const dk=officialSportsbookPublicPage('https://sportsbook.draftkings.com/page/'+sport+'-player-props');
 if(dk)candidates.push({label:'DraftKings Public Props',book:'DraftKings',...dk,url:dk.url});
 return candidates;
}
export function eligiblePublicGameResearch(game,{
 now=Date.now(),horizonMs=40*60*60*1000
}={}){
 const kickoff=Date.parse(game?.kickoff||''),start=kickoff-now;
 return /^\d{7,12}$/.test(String(game?.gameId||''))&&
  ['nfl','nba'].includes(String(game?.league||'').toLowerCase())&&
  Number.isFinite(kickoff)&&start>0&&start<=horizonMs&&
  !!cleanName(game?.home)&&!!cleanName(game?.away)&&
  cleanName(game?.home)!==cleanName(game?.away);
}
export async function researchOfficialGamePages(game,{
 inspect=inspectPublishedSportsbookPage,now=Date.now()
}={}){
 if(!eligiblePublicGameResearch(game,{now}))return{
  ok:false,status:'NO_ELIGIBLE_CURRENT_UPCOMING_MATCHUP',
  gameId:String(game?.gameId||''),pages:[],quotes:[],
  verifiedCombinedBookPrice:false,canChangeSgp:false};
 const pages=officialPublicGamePages(game);
 const checks=await Promise.all(pages.map(async page=>{
  try{
   const observed=await inspect(page.url,{timeoutMs:6000,maxBytes:2000000});
   return{label:page.label,book:page.book,url:page.url,
    status:observed?.status||'NO_PAGE_RESULT',checkedAt:observed?.checkedAt||null,
    quotedSelectionCount:Array.isArray(observed?.quotes)?observed.quotes.length:0,
    quotes:(observed?.quotes||[]).slice(0,35).map(x=>({
     player:String(x.player||'').slice(0,90),
     category:String(x.market||'').slice(0,40),
     rawLine:x.rawLine,americanOdds:x.americanOdds,
     winningMinimum:x.winningMinimum,
     scope:'PUBLIC_PAGE_UNMATCHED_GAME',
     eventIdentityVerified:false,combinedSgpPriceVerified:false
    }))};
  }catch{return{label:page.label,book:page.book,url:page.url,
   status:'PUBLIC_PAGE_UNREADABLE',checkedAt:null,
   quotedSelectionCount:0,quotes:[]}}
 }));
 const quotes=checks.flatMap(x=>x.quotes.map(q=>({...q,book:x.book,sourceUrl:x.url})));
 const checkedAt=new Date(now).toISOString();
 return{ok:true,status:'AUTOMATIC_PUBLIC_RESEARCH_COMPLETED',league:game.league,
  gameId:String(game.gameId),checkedAt,
  booksChecked:['FanDuel','DraftKings'],
  pages:checks,quotes:quotes.slice(0,70),
  sourceQuoteTimestamp:null,
  pageCoverageComplete:false,eventIdentityVerified:false,
  verifiedCombinedBookPrice:false,canChangeSgp:false,
  note:'Official public-page research is limited to visible, paired prices. Bookmaker page may be for a different game and is NEVER used as a verified live selection or SGP quote. Provider-authenticated event prop odds remain authoritative.'};
}
