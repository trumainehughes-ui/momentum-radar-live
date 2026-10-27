import {getSportsDataConfig,validateSportsResearchEvidence} from '../lib/sports-data-registry.js';
// Shared lightweight NBA/NFL/MLB research adapter. No sportsbook lines or prices.
const ROUTES=Object.freeze({
 NBA:'basketball/nba',NFL:'football/nfl',MLB:'baseball/mlb'
});
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 const league=String(req.query?.league||'').trim().toUpperCase();
 const route=ROUTES[league],config=getSportsDataConfig(league);
 if(!route||!config.ok||!config.enabled)return res.status(400).json({ok:false,error:'LEAGUE_NOT_ENABLED'});
  const gameId=String(req.query?.gameId||'').trim();
  if(gameId&&!/^\\d{5,12}$/.test(gameId))return res.status(400).json({ok:false,error:'INVALID_GAME_ID'});
 const date=String(req.query?.date||new Date().toISOString().slice(0,10));
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date)))return res.status(400).json({ok:false,error:'INVALID_DATE'});
 try{
  const dates=date.replaceAll('-','');
  const url='https://site.api.espn.com/apis/site/v2/sports/'+route+'/scoreboard?dates='+dates;
  const response=await fetch(url,{signal:AbortSignal.timeout(7000),headers:{accept:'application/json'}});
  if(!response.ok)throw Error('UPSTREAM_'+response.status);
  const data=await response.json();
  const records=(data.events||[]).map(event=>{
   const competitors=event.competitions?.[0]?.competitors||[];
   const team=side=>{const c=competitors.find(x=>x.homeAway===side);return c?{
    id:c.team?.id,name:c.team?.displayName,score:c.score??null}:null;};
   return {gameId:event.id,gameDate:event.date,status:event.status?.type?.name||null,
    home:team('home'),away:team('away')};
  });
  const validation=validateSportsResearchEvidence(league,{
   source:'espn',observedAt:new Date().toISOString(),records
  });
  return res.status(200).json({ok:true,league,source:'espn',date,records,validation,
   sportsbookVerified:false,emptySlate:records.length===0});
 }catch(e){return res.status(503).json({ok:false,league,error:'RESEARCH_SOURCE_UNAVAILABLE',
  detail:String(e?.message||'unknown').slice(0,80),sportsbookVerified:false});}
}
