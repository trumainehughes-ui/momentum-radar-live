// Read-only NBA game-day feed. This is not a player-pick or sportsbook API.
// The same game-id / team-id provenance boundary used for NFL begins here.
// ESPN site API is an unofficial endpoint and may change.
const ESPN_NBA="https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const HEADERS={"Cache-Control":"public, s-maxage=180, must-revalidate"};
export function parseNbaSlate(json,date) {
  const games=[];
  for(const event of Array.isArray(json?.events)?json.events:[]){
    const id=String(event?.id||"");
    const comp=event?.competitions?.[0];
    const teams=comp?.competitors||[];
    const home=teams.find(t=>t.homeAway==="home");
    const away=teams.find(t=>t.homeAway==="away");
    if(!id||!home?.team?.id||!away?.team?.id||
       !home?.team?.abbreviation||!away?.team?.abbreviation||
       String(home.team.id)===String(away.team.id))continue;
    const kickoff=String(event.date||comp.date||"");
    if(!Number.isFinite(Date.parse(kickoff)))continue;
    const status=String(event.status?.type?.state||"pre");
    games.push({
      gameId:id,kickoff,gameDate:date,
      status:status==="post"?"FINAL":status==="in"?"LIVE":"SCHEDULED",
      home:{id:String(home.team.id),abbr:home.team.abbreviation,
        name:home.team.displayName||home.team.name||home.team.abbreviation,
        score:home.score===undefined?null:String(home.score)},
      away:{id:String(away.team.id),abbr:away.team.abbreviation,
        name:away.team.displayName||away.team.name||away.team.abbreviation,
        score:away.score===undefined?null:String(away.score)}
    });
  }
  return games;
}
export default async function handler(req,res){
  res.setHeader("Cache-Control",HEADERS["Cache-Control"]);
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"method_not_allowed"});
  const date=String(req.query?.date||"");
  const d=Date.parse(date+"T12:00:00Z");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(d)||
     new Date(d).toISOString().slice(0,10)!==date)
    return res.status(400).json({ok:false,error:"valid_date_required"});
  try{
    const r=await fetch(ESPN_NBA+"?dates="+date.replaceAll("-","")+"&limit=100",
      {cache:"no-store",signal:AbortSignal.timeout(9000)});
    if(!r.ok)throw Error("nba_espn_"+r.status);
    const data=await r.json();
    const games=parseNbaSlate(data,date);
    return res.status(200).json({
      ok:true,league:"NBA",date,games,gameCount:games.length,
      source:"ESPN NBA scoreboard",fetchedAt:new Date().toISOString(),
      advisoryOnly:true,playerPropsReady:false,sportsbookVerified:false,
      combinedSgpQuoteVerified:false,aiMechanicsEnabled:false,
      note:"Game schedule only. NBA picks and Small/Medium/Nuke parlays remain disabled until confirmed lineups, player identities, verified markets and model validation are available."
    });
  }catch(e){
    console.error("nba_slate_unavailable",String(e.message||e));
    res.setHeader("Cache-Control","private, no-store");
    return res.status(502).json({ok:false,league:"NBA",error:"nba_schedule_unavailable",
      advisoryOnly:true,playerPropsReady:false,sportsbookVerified:false});
  }
}
