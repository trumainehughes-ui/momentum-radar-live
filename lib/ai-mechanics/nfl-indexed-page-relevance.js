// Search snippets are untrusted indexing artifacts, not live sportsbook odds.
// This classifier checks whether an indexed page appears to mention the
// selected NFL player and market, but NEVER confirms game/offer availability.
const normalize=x=>String(x??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[\u2018\u2019']/g,"").replace(/[^a-z0-9]+/g," ").trim()
 .replace(/\s+/g," ");
const tokens=x=>normalize(x).split(" ").filter(Boolean);
const surnameSuffixes=new Set(["jr","sr","ii","iii","iv","v"]);
const marketPatterns={
 td:[/\banytime\s+(?:touchdown|td)\b/,/\btouchdown\s+scorer\b/,/\bto\s+score\s+(?:a\s+)?touchdown\b/],
 passing:[/\bpassing\s+(?:yards|yds)\b/,/\bpass\s+yards\b/],
 rushing:[/\brushing\s+(?:yards|yds)\b/,/\brush\s+yards\b/],
 receiving:[/\breceiving\s+(?:yards|yds)\b/,/\brec\s+yards\b/],
 receptions:[/\breceptions\b/,/\b(?:number\s+of\s+)?catches\b/]
};
const conflictingSports=/\b(nba|wnba|nhl|mlb|baseball|hockey|soccer|premier league|basketball)\b/;
function containsAllNameParts(text,player){
 const parts=tokens(player);
 if(parts.length<2)return false;
 while(parts.length>2&&surnameSuffixes.has(parts[parts.length-1]))parts.pop();
 const hay=" "+normalize(text)+" ";
 return parts.every(p=>hay.includes(" "+p+" "));
}
export function assessNflIndexedPageRelevance(result,request={}){
 const title=String(result?.title||"").slice(0,350),
  description=String(result?.description||"").slice(0,850),
  path=String(result?.pathname||"").slice(0,350);
 const visible=title+" "+description;
 const playerMentioned=containsAllNameParts(visible,request.player)||
   containsAllNameParts(path,request.player);
 const market=String(request.market||"");
 const hints=marketPatterns[market]||[];
 const text=normalize(visible+" "+path);
 const marketMentioned=hints.some(re=>re.test(text));
 const wrongSport=conflictingSports.test(text)&&!/(\bnfl\b|\bfootball\b)/.test(text);
 // Cross-team or selected-event consistency cannot be proven from an
 // indexed page. Even a page with the exact name and prop needs book checks.
 const findings=[];
 if(!playerMentioned)findings.push("PLAYER_NOT_FOUND_IN_INDEX");
 if(!marketMentioned)findings.push("EXACT_PROP_MARKET_NOT_FOUND_IN_INDEX");
 if(wrongSport)findings.push("POSSIBLE_OTHER_SPORT");
 findings.push("GAME_AND_TEAM_UNVERIFIED");
 findings.push("LIVE_OFFER_AND_PRICE_UNVERIFIED");
 return {
  playerMentioned,marketMentioned,wrongSport,
  candidate:playerMentioned&&!wrongSport,
  matchLevel:playerMentioned&&!wrongSport?
    marketMentioned?"PLAYER_AND_MARKET_INDEX_MENTION":"PLAYER_INDEX_MENTION_ONLY":
    "NOT_A_RELEVANT_PLAYER_RESULT",
  findings,gameVerified:false,playerIdVerified:false,
  liveMarketVerified:false,currentPriceVerified:false,
  combinedSgpVerified:false
 };
}
