// Fail-closed eligibility for real NFL individual sportsbook offers.
// A model can still use injury, usage and matchup evidence without a book quote.
// Reserve-provider rows with no observed timestamp/source remain research only.
import {validateBookOffer} from './sportsbook-market-verification.js';

// Market aliases are derived from the *bookmaker's own selection*. A
// current-game receiving prop must not be replaced by a rushing line with
// the same number, and a TD quote must not inherit a model yardage target.
function nflOfferMarketCategory(value){
 const v=String(value||'').toLowerCase();
 if(['td','passing','rushing','receiving','receptions'].includes(v))return v;
 if(/(?:anytime.*(?:td|touchdown)|touchdown|_td\b)/.test(v))return 'td';
 if(/pass.*(?:yard|yds)/.test(v))return 'passing';
 if(/rush.*(?:yard|yds)/.test(v))return 'rushing';
 if(/receiv.*(?:yard|yds)|reception_yds/.test(v))return 'receiving';
 if(/reception|catch(?:es)?/.test(v))return 'receptions';
 return null;
}
export function nflBookOfferEligible(m,offer,book,now=Date.now()){
 if(!offer||offer.book!==book||offer.available!==true||
    offer.odds===null||offer.odds===undefined||
    String(offer.odds).trim()===''||
    !Number.isSafeInteger(Number(offer.odds))||
    (Math.abs(Number(offer.odds))<100||Math.abs(Number(offer.odds))>100000))return false;
 const gameId=String(m?.eventID||m?.gameId||'');
 // Upstream official-market rows use both playerID and playerId. Require
 // their agreement when both exist rather than losing valid alternate-shape
 // observations or silently accepting a conflicting player identity.
 const canonicalPlayerId=String(m?.playerID??'').trim();
 const alternatePlayerId=String(m?.playerId??'').trim();
 if(canonicalPlayerId&&alternatePlayerId&&canonicalPlayerId!==alternatePlayerId)return false;
 const playerId=canonicalPlayerId||alternatePlayerId;
 const market=String(m?.marketName||m?.statID||'');
 if(!gameId||!playerId||!market)return false;
 const marketCategory=nflOfferMarketCategory(market);
 const bookmakerCategory=nflOfferMarketCategory(offer.category||offer.market);
 const offerId=String(offer.offerId||offer.selectionId||'').trim();
 if(!marketCategory||bookmakerCategory!==marketCategory||!offerId||
  String(offer.gameId||'')!==gameId||
  String(offer.playerId||'')!==playerId)return false;
 // A model refresh timestamp cannot make a stale bookmaker price current.
 const checkedAt=offer.checkedAt;
 const at=Date.parse(String(checkedAt||''));
 if(!Number.isFinite(now)||!Number.isFinite(at)||
    at>now+60_000||now-at>15*60_000)return false;
 // Every provider must supply its own market threshold; never fall back
 // to a model or enclosing market row. This check precedes provider shortcuts.
 // Use the normalized market identity, so player_td and anytime_td are
 // both scored as yes/no touchdown offers (not numeric yardage markets).
 const isTd=marketCategory==='td';
 if(!isTd&&(offer.line===null||offer.line===undefined||String(offer.line).trim()===''||(!Number.isFinite(Number(offer.line))||Number(offer.line)<=0)))return false;
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
