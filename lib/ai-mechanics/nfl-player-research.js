// Read-only NFL research planner for the existing Groq explanation layer.
// Plans player/market lookups from already-fetched ESPN and model records.
// NEVER upgrades a web search result, public snippet or AI response into odds.
const normalize=x=>String(x||"").normalize("NFKC").toLowerCase()
  .replace(/[.\u2019']/g,"").replace(/[^\p{L}\p{N}]+/gu," ").trim()
  .replace(/\s+/g," ");
const marketName={
 td:"anytime touchdown scorer",passing:"passing yards",
 rushing:"rushing yards",receiving:"receiving yards",receptions:"receptions"
};
const riskyStatuses=new Set(["OUT","IR","INACTIVE","DOUBTFUL","QUESTIONABLE",
 "SUSPENDED","PUP","UNVERIFIED"]);
const trimmed=x=>String(x||"").trim().slice(0,110);

export function buildNflPlayerResearchQueue({
 game={},categories={},playerAvailability={},marketEvidence={},
 maxPlayers=10
}={}) {
 const allowed=new Set(["td","passing","rushing","receiving","receptions"]);
 const limit=Number.isSafeInteger(maxPlayers)?Math.max(1,Math.min(15,maxPlayers)):10;
 const roster=Array.isArray(playerAvailability?.players)?playerAvailability.players:[];
 const checks=Array.isArray(playerAvailability?.playerChecks)?playerAvailability.playerChecks:[];
 const injuries=Array.isArray(playerAvailability?.injuries)?playerAvailability.injuries:[];
 const byName=new Map();
 const append=(item,kind)=>{
   const name=normalize(item?.name),team=normalize(item?.team||item?.rosterTeam);
   if(!name||!team)return;
   const key=name+"|"+team;
   if(!byName.has(key))byName.set(key,{});
   const record=byName.get(key);
   if(record[kind]&&record[kind]!==item)record.ambiguous=true;
   record[kind]=item;
 };
 for(const p of roster)append(p,"roster");
 for(const i of injuries)append(i,"injury");
 for(const c of checks){
   append({...c,team:c.marketTeam||c.rosterTeam},"check");
   if(c.rosterTeam&&normalize(c.rosterTeam)!==normalize(c.marketTeam))
     append({...c,team:c.rosterTeam},"check");
 }
 const rows=new Map();
 for(const [category,values] of Object.entries(categories||{})){
   if(!allowed.has(category)||!Array.isArray(values))continue;
   for(const x of values.slice(0,8)){
     const name=trimmed(x?.name),team=trimmed(x?.team);
     if(!name||!team)continue;
     const key=normalize(name)+"|"+normalize(team);
     const id=trimmed(x?.playerId||x?.playerID);
     const rowKey=key+"|"+category;
     if(rows.has(rowKey))continue;
     const evidence=byName.get(key)||{};
     const role=evidence.roster||{};
     const injury=evidence.injury||{};
     const check=evidence.check||{};
     const injuryStatus=trimmed(injury.status||role.availability||check.injuryStatus)
       .toUpperCase()||"UNVERIFIED";
     const rosterMatched=Boolean(id&&role.playerId&&String(role.playerId)===id&&
       normalize(role.name)===normalize(name)&&normalize(role.team)===normalize(team));
     const teamMismatch=check.status==="TEAM_MISMATCH" ||
       (role.name&&normalize(role.team)!==normalize(team));
     const starterConfirmed=rosterMatched && role.starterVerified===true;
     const flagged=riskyStatuses.has(injuryStatus);
     const issues=[];
     if(teamMismatch)issues.push("TEAM_MISMATCH");
     if(evidence.ambiguous)issues.push("AMBIGUOUS_SOURCE");
     if(!rosterMatched)issues.push("ROSTER_IDENTITY_UNVERIFIED");
     if(flagged)issues.push("INJURY_OR_AVAILABILITY_CHECK");
     if(!starterConfirmed)issues.push("STARTER_STATUS_UNVERIFIED");
     // Current valid individual sportsbook offers remain separately gated by
     // source timestamp, original book ID, exact game, period and market.
     issues.push("EXACT_BOOK_LINE_AND_ODDS_UNVERIFIED");
     issues.push("COMBINED_SGP_QUOTE_UNVERIFIED");
     const queryBase=[name,team,trimmed(game?.awayAbbr),
       trimmed(game?.homeAbbr),marketName[category]].filter(Boolean).join(" ");
     const sites={
       roster:"site:espn.com/nfl/player "+name+" "+team,
       injuries:"site:nfl.com "+name+" "+team+" injury status",
       draftKings:"site:sportsbook.draftkings.com "+queryBase,
       fanDuel:"site:sportsbook.fanduel.com "+queryBase
     };
     rows.set(rowKey,{
       player:name,team,playerId:id||null,category,
       market:marketName[category],injuryStatus,
       starterConfirmed,rosterMatched,teamMismatch,issues,
       lookups:sites,bookOfferVerified:false,combinedSgpQuoteVerified:false,
       modelProjection:Number.isFinite(Number(x?.projection))?
         Number(x.projection):null
     });
   }
 }
 const priority=r=>Number(r.teamMismatch)*100+
   Number(r.issues.includes("INJURY_OR_AVAILABILITY_CHECK"))*50+
   Number(!r.rosterMatched)*30+Number(!r.starterConfirmed)*20+
   Number(r.category==="td")*3;
 const queue=[...rows.values()].sort((a,b)=>priority(b)-priority(a)||
   a.player.localeCompare(b.player)||a.category.localeCompare(b.category))
   .slice(0,limit);
 return {
   league:"NFL",gameId:trimmed(game?.gameId)||null,
   source:"ESPN roster/injuries + Momentum Radar model categories",
   sportsbookEvidenceState:trimmed(marketEvidence?.state)||"UNAVAILABLE",
   queue,queuedPlayers:new Set(queue.map(x=>normalize(x.player)+"|"+normalize(x.team))).size,
   quotedBookPricesVerified:0,combinedSgpQuotesVerified:0,
   aiMayResearch:true,aiMayVerifyPrices:false,advisoryOnly:true,
   message:"Research tasks only. Web or AI results cannot verify sportsbook prices; independently confirm exact source, game, timestamp, player, market, line and offered odds."
 };
}
