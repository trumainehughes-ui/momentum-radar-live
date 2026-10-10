// NBA SportsGameOdds v2 event.odds -> server-only ESPN player evidence.
// Uses the same independent ESPN/SGO event & player crosswalk as NFL.
// Source: statID IDs and oddID schema from the SportsGameOdds basketball docs.
// Does not fetch new odds, infer missing identities, publish picks or place bets.
import { buildSgoReadOnlyCrosswalk } from "./sgo-crosswalk.js";
import { reviewNbaGameMarkets } from "./nba-game-review.js";
import { supportedLeagueMarket } from "./league-parity.js";

const MARKETS=Object.freeze({
  points:"points",rebounds:"rebounds",assists:"assists",
  threePointersMade:"three_pointers","points+rebounds+assists":"pra",
  "points+rebounds":"points_rebounds","points+assists":"points_assists",
  "rebounds+assists":"rebounds_assists",steals:"steals",blocks:"blocks"
});
const BOOKS=Object.freeze({draftkings:"DraftKings",fanduel:"FanDuel"});
const failure=reason=>({
  ready:false,advisoryOnly:true,publishingDisabled:true,
  reason,marketRows:0,combinedSgpQuoteVerified:false,reviewed:[]
});
export function nbaSgoMarketId(raw){
  if(!raw || raw.periodID!=="game" || raw.betTypeID!=="ou" ||
     raw.sideID!=="over")return null;
  const market=MARKETS[String(raw.statID||"")];
  return supportedLeagueMarket("NBA",market)?market:null;
}
export function reviewNbaSgoRawEvent({
  game,event,picks=[],capturedAt,now,modelSgps=[]
}={}){
  if(event?.leagueID!=="NBA")return failure("wrong_upstream_league");
  const crosswalk=buildSgoReadOnlyCrosswalk({game,event,capturedAt,now});
  if(!crosswalk.ready)return {...failure(crosswalk.reason),
    unmatchedPlayers:crosswalk.unresolvedPlayers};
  const playerByUpstream=new Map(crosswalk.playerMappings.map(p=>[p.upstreamPlayerId,p]));
  const rows=[];
  for(const raw of Object.values(event.odds||{})){
    const market=nbaSgoMarketId(raw);
    if(!market)continue;
    const upstreamId=String(raw.statEntityID||raw.playerID||"");
    const player=playerByUpstream.get(upstreamId);
    if(!player || String(event.players?.[upstreamId]?.teamID||"")!==
      crosswalk.eventMapping.teamIds[player.team])continue;
    const offers=[];
    for(const [id,main] of Object.entries(raw.byBookmaker||{})){
      const book=BOOKS[String(id).toLowerCase().replace(/[^a-z]/g,"")];
      if(!book || !main)continue;
      for(const offer of [main,...(Array.isArray(main.altLines)?main.altLines:[])]){
        if(!offer || offer.available!==true)continue;
        const line=offer.overUnder??offer.spread;
        if(line===null||line===undefined||line===""||
           !Number.isFinite(Number(line))||Number(line)<0)continue;
        if(!offer.lastUpdatedAt)continue;
        const price=offer.odds;
        offers.push({book,line:Number(line),odds:price,available:true,
          lastUpdatedAt:offer.lastUpdatedAt,source:"SportsGameOdds"});
      }
    }
    if(!offers.length)continue;
    rows.push({
      gameId:String(game.gameId),providerEventId:String(event.eventID),
      playerId:String(player.playerId),team:player.team,market,
      source:"SportsGameOdds",provenance:"verified_server_crosswalk",
      books:offers
    });
  }
  const reviewed=reviewNbaGameMarkets({game,picks,markets:rows,now,modelSgps});
  return {...reviewed,source:"SportsGameOdds NBA raw event",
    matchedPlayers:crosswalk.matchedPlayers,
    unmatchedPlayers:crosswalk.unresolvedPlayers,marketRows:rows.length,
    advisoryOnly:true,publishingDisabled:true};
}
