import {nflSeasonForDate} from '../lib/nfl-season-team-normalization.js';
import {licensedTeamRankings} from '../lib/teamrankings-licensed-feed.js';
import {nflLicensedDefensiveContext} from '../lib/nfl-licensed-defensive-context.js';

// Read-only readiness endpoint. Never exposes feed URL, credentials or unlicensed values.
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
 res.setHeader('Cache-Control','no-store');
 const season=req.query?.season===undefined?nflSeasonForDate(new Date().toISOString().slice(0,10)):Number(req.query.season);
 if(!Number.isInteger(season)||season<2020||season>2100)return res.status(400).json({ok:false,error:'INVALID_SEASON'});
 const data=await licensedTeamRankings(season);
 const ready=data.status==='READY';
 const coverage=ready?Object.entries(data.teams).map(([team,metrics])=>({
  team,metrics:Object.keys(metrics).length,
  passing:nflLicensedDefensiveContext('passingYards',{status:'READY',defensiveMetrics:metrics}).available,
  rushing:nflLicensedDefensiveContext('rushingYards',{status:'READY',defensiveMetrics:metrics}).available
 })):[];
 return res.status(200).json({
  ok:true,season,source:'TeamRankings licensed feed',
  status:data.status,licensedFeedReady:ready,
  updatedAt:ready?data.updatedAt:null,
  metrics:ready?data.metrics:[],
  teamsCovered:coverage.length,
  passingTeamsCovered:coverage.filter(x=>x.passing).length,
  rushingTeamsCovered:coverage.filter(x=>x.rushing).length,
  fallback:'ESPN box scores remain the primary source whenever licensed data is absent',
  predictionsAdjusted:false,
  reason:ready?null:data.status==='NOT_LICENSED'?'LICENSED_FEED_NOT_CONFIGURED':'LICENSED_FEED_UNAVAILABLE'
 });
}
