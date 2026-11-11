// Public-side disclosure of the same verified-bookmaker-feed switch used by NFL markets.
// A configured provider is not proof of a current market or combined SGP quote.
export function publicNflMarketSourcePolicy(env={}){
 const enabled=String(env.MOMENTUM_VERIFIED_BOOK_FEEDS||'').toLowerCase()==='enabled';
 return {preferredBooks:['DraftKings','FanDuel'],verifiedBookFeedsEnabled:enabled,
  individualPropsRequireBookAndTimestamp:true,combinedSgpRequiresBookIssuedQuote:true,
  modelOnlyCandidatesAreNotBettable:true};
}
