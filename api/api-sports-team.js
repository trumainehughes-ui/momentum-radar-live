import {apiSports} from './_api-sports.js';
const okSport=s=>['nfl','nba'].includes(s);
function phase(kickoff){const ms=new Date(kickoff||0).getTime()-Date.now();return ms>0&&ms<=30*60000?'final30':ms>0&&ms<=90*60000?'final90':ms>0&&ms<=6*3600000?'pregame':'normal'}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store'); if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const sport=String(req.query.sport||'nfl').toLowerCase(),team=String(req.query.team||''),season=String(req.query.season||new Date().getUTCFullYear()),kickoff=String(req.query.kickoff||'');
 if(!okSport(sport)||!team)return res.status(400).json({ok:false,error:'sport_and_team_required'});
 const p=phase(kickoff),priority=['final90','final30'].includes(p)?'critical':'normal';
 try{
  const [players,injuries]=await Promise.all([
   apiSports({sport,path:'players',query:{team,season},kind:'players',phase:p,priority}),
   apiSports({sport,path:'injuries',query:{team,season},kind:'injuries',phase:p,priority})
  ]);
  return res.status(200).json({ok:true,sport,team,season,phase:p,sources:{players:{cache:players.cache,remaining:players.remaining,fetchedAt:players.fetchedAt},injuries:{cache:injuries.cache,remaining:injuries.remaining,fetchedAt:injuries.fetchedAt}},players:players.data,injuries:injuries.data});
 }catch(e){return res.status(503).json({ok:false,sport,team,error:String(e.message||e),fetchedAt:new Date().toISOString()})}
}
