import {auditNbaBookOffers} from './nba-book-offer-evidence.js';
import {selectNbaEdgeHunter} from './nba-edge-hunter.js';
// Explicit adapter boundary: only validated official book observations can
// supply player prop lines. Game totals/spreads need independent book proof.
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const str=x=>String(x??'').trim();
const domains={DraftKings:'draftkings.com',FanDuel:'fanduel.com'};
const officialDomain=(book,source)=>{
 try{const u=new URL(source);const host=u.hostname.toLowerCase();
  return u.protocol==='https:'&&Boolean(domains[book])&&
   (host===domains[book]||host.endsWith('.'+domains[book]));
 }catch{return false;}
};
export function buildVerifiedNbaEdgeHunterGames({games=[],offers=[],now=Date.now()}={}){
 return (Array.isArray(games)?games:[]).map(game=>{
  const gameId=str(game.gameId);
  const audit=auditNbaBookOffers(offers,{gameId,now});
  const total=game.totalEvidence,spread=game.spreadEvidence;
  const marketOK=x=>x&&x.gameId===gameId&&
   officialDomain(x.book,str(x.sourceUrl))&&
   str(x.marketId)&&
   finite(x.value)&&Number.isFinite(Date.parse(x.observedAt))&&
   Date.parse(x.observedAt)<=now+60000&&now-Date.parse(x.observedAt)<=30*60000;
  const bookTotalsVerified=marketOK(total)&&marketOK(spread)&&total.book===spread.book;
  const players=(Array.isArray(game.players)?game.players:[]).flatMap(p=>{
   const matching=audit.accepted.filter(o=>o.playerId===str(p.playerId)&&
    o.market===str(p.category)&&o.gameId===gameId&&
    bookTotalsVerified&&o.book===total.book);
   return matching.map(o=>({...p,line:o.exactLine,marketVerified:true,
    book:o.book,selectionId:o.selectionId,americanOdds:o.americanOdds,
    sourceUrl:o.sourceUrl,observedAt:o.observedAt}));
  });
  return {...game,total:bookTotalsVerified?total.value:null,
   spread:bookTotalsVerified?spread.value:null,players,
   bookTotalsVerified,bookPlayerMarketsVerified:players.length>0,
   rejectedOfferCount:audit.rejected.length};
 });
}
export function researchVerifiedNbaEdgeHunter(input){
 return selectNbaEdgeHunter(buildVerifiedNbaEdgeHunterGames(input));
}
