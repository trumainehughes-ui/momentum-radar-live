// Public-safe connection status. No API keys, provider responses or quota
// details are exposed. A READY state means indexed-page discovery is enabled,
// NOT that any DraftKings/FanDuel odds or combined SGPs were verified.
export default function handler(req,res){
 res.setHeader("Cache-Control","private, no-store");
 if(req.method!=="GET")return res.status(405).json({ok:false,error:"method_not_allowed"});
 const enabled=process.env.NFL_PUBLIC_WEB_SEARCH_ENABLED==="true";
 const configured=Boolean(process.env.BRAVE_SEARCH_API_KEY);
 const ready=enabled&&configured;
 return res.status(200).json({
  ok:true,league:"NFL",feature:"official_sportsbook_page_discovery",
  state:ready?"READY_RESEARCH_ONLY":!enabled?"DISABLED":"MISSING_KEY",
  ready,searchProvider:"Brave Search",
  bookSources:["DraftKings","FanDuel"],
  livePlayerOddsVerified:false,combinedSgpPriceVerified:false,
  sharedGlobalRateLimit:false,
  message:ready?
   "Indexed official sportsbook page search enabled. Results do not verify live player props or combined SGP odds.":
   "Official sportsbook page discovery not connected. Continue using the player research checklist; no betting odds are verified."
 });
}
