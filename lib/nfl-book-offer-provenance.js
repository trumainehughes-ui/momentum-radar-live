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
 // The Odds API is fetched by our server from an authenticated integration.
 // Its native response provides a last_update but not an individual source URL.
 // Accept it only if the enclosing market row is from that same adapter.
 if(offer.sourceProvider==='The Odds API')
  return m?.provider==='The Odds API';
 const sourceUrl=offer.sourceUrl||m?.sourceUrl;
 if(!sourceUrl)return false;
 // Never use a row/model threshold as a substitute for an absent book line.
 const isTd=/touchdown|anytime_td/i.test(market);
 if(!isTd&&(offer.line===null||offer.line===undefined||String(offer.line).trim()===''||!Number.isFinite(Number(offer.line))))return false;
 const n=Number(offer.odds);
 return validateBookOffer({book,sport:'NFL',gameId,playerId,market,
  line:isTd?'yes':String(offer.line),
  americanOdds:(n>0?'+':'')+String(n),
  checkedAt,sourceUrl,available:true},now).ok;
}
