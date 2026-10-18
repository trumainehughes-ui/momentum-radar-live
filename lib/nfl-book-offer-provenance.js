// Fail-closed eligibility for real NFL individual sportsbook offers.
// A model can still use injury, usage and matchup evidence without a book quote.
// Reserve-provider rows with no observed timestamp/source remain research only.
import {validateBookOffer} from './sportsbook-market-verification.js';

export function nflBookOfferEligible(m,offer,book,now=Date.now()){
 if(!offer||offer.book!==book||offer.available!==true||
    offer.odds===null||offer.odds===undefined||
    String(offer.odds).trim()===''||
    !Number.isFinite(Number(offer.odds))||Number(offer.odds)===0)return false;
 const gameId=String(m?.eventID||m?.gameId||'');
 const playerId=String(m?.playerID||'');
 const market=String(m?.marketName||m?.statID||'');
 if(!gameId||!playerId||!market)return false;
 const checkedAt=offer.checkedAt||m?.checkedAt;
 const at=Date.parse(String(checkedAt||''));
 if(!Number.isFinite(now)||!Number.isFinite(at)||
    at>now+60_000||now-at>15*60_000)return false;
 // Every provider must supply its own market threshold; never fall back
 // to a model or enclosing market row. This check precedes provider shortcuts.
 const isTd=/touchdown|anytime_td/i.test(market);
 if(!isTd&&(offer.line===null||offer.line===undefined||String(offer.line).trim()===''||!Number.isFinite(Number(offer.line))))return false;
 // Only official, directly observed sportsbook pages qualify. An API
 // adapter, mirrored odds index, syndicated listing or arbitrary HTTPS link
 // is never enough to mark a line as currently bookable.
 if(offer.sourceProvider&&
   !['DraftKings Sportsbook','FanDuel Sportsbook','DIRECT_OFFICIAL_SPORTSBOOK']
     .includes(String(offer.sourceProvider)))return false;
 const sourceUrl=offer.sourceUrl;
 if(!sourceUrl)return false;
 let url;
 try{url=new URL(String(sourceUrl))}catch{return false}
 const hostname=url.hostname.toLowerCase();
 const validHost=book==='DraftKings'?
  hostname==='sportsbook.draftkings.com':
  book==='FanDuel'?
   ['sportsbook.fanduel.com','co.sportsbook.fanduel.com'].includes(hostname):false;
 if(!validHost||url.protocol!=='https:'||
   url.username||url.password||url.port)return false;
 const n=Number(offer.odds);
 return validateBookOffer({book,sport:'NFL',gameId,playerId,market,
  line:isTd?'yes':String(offer.line),
  americanOdds:(n>0?'+':'')+String(n),
  checkedAt,sourceUrl,available:true},now).ok;
}
