import {getSportsDataConfig,validateSportsResearchEvidence} from '../lib/sports-data-registry.js';
// Read-only MLB official StatsAPI adapter. No odds or predictions are inferred.
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 const date=String(req.query?.date||new Date().toISOString().slice(0,10));
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date)))return res.status(400).json({ok:false,error:'INVALID_DATE'});
 try{
  const gameId=String(req.query?.gameId||'').trim();
  if(gameId){
   if(!/^\\d{5,9}$/.test(gameId))return res.status(400).json({ok:false,error:'INVALID_GAME_ID'});
   const response=await fetch('https://statsapi.mlb.com/api/v1/game/'+gameId+'/boxscore',{
    signal:AbortSignal.timeout(6500),headers:{accept:'application/json'}
   });
   if(!response.ok)throw Error('MLB_BOXSCORE_UPSTREAM_'+response.status);
   const data=await response.json();
   const records=['home','away'].flatMap(side=>
    Object.values(data.teams?.[side]?.players||{}).map(player=>({
     playerId:player.person?.id,name:player.person?.fullName,teamSide:side,
     position:player.position?.abbreviation,batting:player.stats?.batting||null,
     pitching:player.stats?.pitching||null
    })));
   return res.status(200).json({ok:true,league:'MLB',source:'mlb_official',gameId,
    records,validation:validateSportsResearchEvidence('MLB',{
     source:'mlb_official',observedAt:new Date().toISOString(),records
    }),sportsbookVerified:false});
  }
  const url='https://statsapi.mlb.com/api/v1/schedule?sportId=1&date='+encodeURIComponent(date);
  const response=await fetch(url,{signal:AbortSignal.timeout(6500),headers:{accept:'application/json'}});
  if(!response.ok)throw Error('MLB_UPSTREAM_'+response.status);
  const payload=await response.json();
  const records=(payload.dates||[]).flatMap(d=>(d.games||[]).map(g=>({
   gameId:g.gamePk,gameDate:g.gameDate,status:g.status?.abstractGameState,
   home:{id:g.teams?.home?.team?.id,name:g.teams?.home?.team?.name},
   away:{id:g.teams?.away?.team?.id,name:g.teams?.away?.team?.name}
  })));
  const gate=validateSportsResearchEvidence('MLB',{
   source:'mlb_official',observedAt:new Date().toISOString(),records
  });
  return res.status(200).json({ok:true,league:'MLB',source:'mlb_official',date,records,
   validation:gate,sportsbookVerified:false,
   note:records.length?'Verified official schedule records; not a sportsbook offer':'No games returned for date'});
 }catch(e){return res.status(503).json({ok:false,league:'MLB',source:'mlb_official',
  error:'OFFICIAL_SCHEDULE_UNAVAILABLE',errorType:String(e?.message||'unknown').slice(0,80),
  fallback:getSportsDataConfig('MLB').crossCheck,sportsbookVerified:false});}
}
