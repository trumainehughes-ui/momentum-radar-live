// Permit only actual bookmaker destinations. No guessed sportsbook event or
// prop URLs, javascript links, user credentials or arbitrary web fetches.
const OWNERS=Object.freeze({
 DraftKings:new Set(['sportsbook.draftkings.com','dknetwork.draftkings.com']),
 FanDuel:new Set(['sportsbook.fanduel.com'])
});
export function officialSportsbookUrl(value,book,{research=false}={}){
 if(typeof value!=='string'||value.length>2200)return null;
 try{
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port||
   u.hash||!OWNERS[book]?.has(u.hostname.toLowerCase()))return null;
  if(!research&&u.hostname==='dknetwork.draftkings.com')return null;
  if(u.pathname.length>500||u.search.length>1600)return null;
  return u.href;
 }catch{return null}
}
export function officialSportsbookPublicPage(value){
 for(const book of ['DraftKings','FanDuel']){
  const uri=officialSportsbookUrl(value,book,{research:true});
  if(!uri)continue;
  const u=new URL(uri);
  // A user supplied URL is intentionally limited to published odds pages,
  // rather than becoming a generic HTTPS proxy into unrelated endpoints.
  const supported=book==='FanDuel'?
   /^\/teams\/(nfl|nba)\/[a-z0-9-]+\/odds\/?$/i.test(u.pathname):
   u.hostname==='dknetwork.draftkings.com'?
   /^\/draftkings-sportsbook-player-props\/?$/i.test(u.pathname):
   /^\/page\/(nfl|nba)-player-props\/?$/i.test(u.pathname);
  if(supported)return{url:uri,book,pageType:book==='FanDuel'?
   'FANDUEL_TEAM_PROPS':u.hostname==='dknetwork.draftkings.com'?
   'DRAFTKINGS_NETWORK_PUBLIC_PROPS':'DRAFTKINGS_PUBLIC_PLAYER_PROPS'};
 }
 return null;
}
