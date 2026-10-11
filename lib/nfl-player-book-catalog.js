// Preserve a compact catalog of real, individually priced NFL prop lines
// for BOTH DraftKings and FanDuel. No model estimate, source-independent
// multiplication, unsupported selection or unavailable book is presented
// as a sportsbook price. Main and alternate lines remain distinguishable.
import {officialSportsbookUrl} from './sportsbook-public-links.js';

const ALLOWED=new Set(['DraftKings','FanDuel']);
const CATS=new Set(['td','passing','rushing','receiving','receptions']);
const clean=x=>String(x??'').slice(0,95);
const stringId=x=>String(x??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const parseLine=(v,cat)=>{
 if(cat==='td')return'Anytime TD';
 if(v===null||v===undefined||v==='')return null;
 const s=String(v).trim();
 return /^\d+(?:\.\d+)?\+?$/.test(s)?s:null;
};
const isValidPrice=v=>v!==null&&v!==undefined&&v!==''&&
 Number.isFinite(Number(v))&&Number(v)!==0;
export function buildNflPlayerBookCatalog(rows,{
 eventID='',maxPerBook=24
}={}){
 const output=new Map();
 for(const m of Array.isArray(rows)?rows:[]){
  const cat=clean(m?.cat||m?.category).toLowerCase(),
   name=clean(m?.name),playerID=String(m?.playerID||m?.playerId||'');
  if(!name||!playerID||!CATS.has(cat)||!Array.isArray(m?.books))continue;
  if(m?.periodID!=='game'||
   cat==='td'&&!(m?.betTypeID==='yn'&&m?.sideID==='yes')||
   cat!=='td'&&!(m?.betTypeID==='ou'&&m?.sideID==='over'))continue;
  if(eventID&&String(m.eventID)!==String(eventID))continue;
  const key=playerID+'|'+cat;
  if(!output.has(key))output.set(key,{playerID,name,category:cat,
   DraftKings:[],FanDuel:[]});
  const current=output.get(key);
  for(const bookOffer of m.books){
   const book=bookOffer?.book;
   if(!ALLOWED.has(book)||bookOffer.available===false||
    !isValidPrice(bookOffer.odds))continue;
   const line=parseLine(bookOffer.line,cat);
   if(line===null)continue;
   const odds=Number(bookOffer.odds);
   const bucket=current[book];
   if(bucket.length>=maxPerBook)continue;
   if(bucket.some(x=>x.line===line&&x.odds===odds))continue;
   bucket.push({line,odds,book,
    source:clean(bookOffer.source||m.provider||''),
    offerType:clean(bookOffer.offerType||'SOURCE_INDIVIDUAL'),
    deeplink:officialSportsbookUrl(bookOffer.deeplink,book),
    combinedQuoteVerified:false});
  }
 }
 for(const item of output.values()){
  for(const book of ALLOWED)item[book].sort((a,b)=>{
   if(item.category==='td')return b.odds-a.odds;
   const aN=Number(String(a.line).replace('+','')),
    bN=Number(String(b.line).replace('+',''));
   return aN-bN||b.odds-a.odds;
  });
 }
 return output;
}
