// Converts a SportsGameOdds v2 event odd into priced, independently
// selectable main/alternate offers without calling any new API.
// The bookmaker's altLines live in byBookmaker.<book>.altLines[].
// No partial-game, under, disabled, other-book, unauthenticated URL, or
// arbitrary text is turned into a wager-ready market.
import {officialSportsbookUrl} from './sportsbook-public-links.js';
const bookOf=x=>{
 const k=String(x||'').toLowerCase().replace(/[^a-z]/g,'');
 return k==='draftkings'?'DraftKings':k==='fanduel'?'FanDuel':null;
};
const priced=x=>{
 if(x?.available!==true||x?.odds===null||x?.odds===undefined||
  x?.odds===''||!Number.isFinite(Number(x.odds))||Number(x.odds)===0)return null;
 return Number(x.odds);
};
export function sgoBookmakerVariants(odd,{maxAltPerBook=32}={}){
 if(!odd||odd.periodID!=='game'||!(
    odd.betTypeID==='ou'&&odd.sideID==='over'||
    odd.statID==='touchdowns'&&odd.betTypeID==='yn'&&odd.sideID==='yes'
 ))return[];
 const entries=Object.entries(odd.byBookmaker||{}),result=[];
 for(const [sourceName,source] of entries){
  const book=bookOf(sourceName);
  if(!book||!source)continue;
  const mainPrice=priced(source);
  const mainLine=source.overUnder??source.spread??null;
  const mainUrl=officialSportsbookUrl(source.deeplink,book);
  if(mainPrice!==null)result.push({
   book,odds:mainPrice,line:mainLine,available:true,
   deeplink:mainUrl,alt:false,source:'SportsGameOdds',
   offerType:'SOURCE_BOOK_ODDS',lineType:source.lineType||null
  });
  const alts=Array.isArray(source.altLines)?source.altLines.slice(0,maxAltPerBook):[];
  for(const alt of alts){
   const odds=priced(alt),line=alt?.overUnder??alt?.spread??null;
   if(odds===null||(
    odd.betTypeID==='ou'&&
    (line===null||line===undefined||String(line).trim()==='')
   ))continue;
   result.push({book,odds,line,available:true,
    deeplink:officialSportsbookUrl(alt.deeplink,book)||mainUrl,
    alt:true,source:'SportsGameOdds',offerType:'SOURCE_BOOK_ALT_LINE',
    lineType:alt.lineType||null});
  }
 }
 const dedup=new Map();
 for(const entry of result){
  const key=entry.book+'|'+String(entry.line)+'|'+String(entry.odds);
  if(!dedup.has(key))dedup.set(key,entry);
 }
 return[...dedup.values()];
}
export function expandSgoPlayerMarket(odd,eventID,baseMarket){
 if(typeof baseMarket!=='function')return[];
 const variants=sgoBookmakerVariants(odd);
 // Keep each line separately for per-book, per-tier selection: do NOT
 // collapse all alt lines into a single global player's "best" line.
 return variants.map(o=>{
  const row=baseMarket(odd,eventID);
  return{...row,books:[o],
   sourceMarketName:odd.marketName||'',
   sourceOddID:String(odd.oddID||''),
   sourceBook:o.book,sourceOfferType:o.offerType};
 });
}
