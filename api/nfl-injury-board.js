import {nflOfficialWeeklyFromLeague,nflCanonTeam} from '../lib/nfl-official-injury-feed.js';
const ESPN='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
function dateEt(d=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const date=String(req.query.date||dateEt());
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({ok:false,error:'invalid_date'});
 try{
  const rsp=await fetch(ESPN+'?dates='+date.replaceAll('-','')+'&limit=100',{
   signal:AbortSignal.timeout(12000),headers:{accept:'application/json'}});
  if(!rsp.ok)throw Error('ESPN_scoreboard_'+rsp.status);
  const scoreboard=await rsp.json(),games=scoreboard.events||[],results=[];
  for(const event of games){
   const c=event.competitions?.[0]||{},teams=(c.competitors||[]).map(x=>nflCanonTeam(x.team?.abbreviation)).filter(Boolean);
   const year=Number(event.season?.year||date.slice(0,4)),week=Number(event.week?.number||scoreboard.week?.number);
   if(teams.length!==2||!Number.isInteger(week)||week<1)continue;
   const weekly=await nflOfficialWeeklyFromLeague({year,week,teams,
    seasonType:Number(event.season?.type||2)===3?'POST':'REG'});
   const entries=weekly?.available?weekly.entries:[];
   const counts=Object.fromEntries(['OUT','DOUBTFUL','QUESTIONABLE','PROBABLE'].map(x=>[x,entries.filter(p=>p.status===x).length]));
   results.push({gameId:String(event.id),teams,week,year,status:weekly?.available?'NFL_WEEKLY_AVAILABLE':'NFL_WEEKLY_UNAVAILABLE',
    source:weekly?.source||null,url:weekly?.url||null,checkedAt:weekly?.checkedAt||null,
    coverage:weekly?.available===true,officialInactivesVerified:false,gameDesignations:entries.length,
    practiceRows:weekly?.practiceEntries?.length||0,counts});
  }
  return res.status(200).json({ok:true,date,source:'NFL.com official weekly report',games:results,
   gamesChecked:results.length,sourceCoverage:results.filter(g=>g.coverage).length,
   fetchedAt:new Date().toISOString(),note:'Weekly designations are not final game-day inactives; no practice-only player is labeled OUT.'});
 }catch(e){
  return res.status(503).json({ok:false,date,sourceCoverage:0,
   error:'weekly_injury_board_unavailable',detail:String(e.message||e)});
 }
}
