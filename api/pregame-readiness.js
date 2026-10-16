import {blobStorageReadiness} from '../lib/blob-storage-config.js';
// Safe operational status: no secrets, provider calls, paid credits, Blob I/O,
// or user information. Does not claim an upstream feed or SGP is live.
export function pregameReadiness(env={}){
 const cron=Boolean(env.CRON_SECRET),storage=blobStorageReadiness(env);
 const available=cron&&storage.configured;
 return{ok:true,status:available?'CONFIGURED':'BLOCKED',storage,
  leagueWidePolicy:{registeredSports:['nfl','nba'],futureSportAdaptersRequired:true,
   coverage:'Every qualified scheduled game, not just popular/selected matchups',
   lookaheadHours:{nfl:30,nba:36},cronIntervalMinutes:15,
   leagueGameShards:2,
   collectorAuditUrls:['/api/pregame-collector-status?league=nfl',
    '/api/pregame-collector-status?league=nba'],
   windows:['DAY_AHEAD_BUILD','PREGAME_VALIDATION','FINAL_T_MINUS_30'],
   finalCheck:'First qualifying scheduled 15-minute run at or below 30 minutes to kickoff/tip-off; exact-minute execution not guaranteed',
   automaticRecalculation:['injury_designations','roster_role_evidence','player_props','sgp_small_medium_nuke','offense_vs_defense'],
   aiPolicy:'Advisory review only; no unverified sportsbook quote or injury eligibility override'},
  nfl:{cronConfigured:cron,collectorReady:available,modelRefreshMinutes:15,
   propTypes:['anytime_td','passing','rushing','receiving','receptions'],
   tMinus30Policy:'Refresh eligible model props and SGPs with reported injuries, roster, offense-defense and AI advisory'},
  nba:{cronConfigured:cron,collectorReady:available,modelRefreshMinutes:15,
   modelRebuildMinutes:{dayAhead:60,pregameValidation:15,final30:10},
   propTypes:['points','rebounds','assists','threes','pra'],
   dayAheadPolicy:'ESPN completed game baseline + current rosters + capped opponent defense context; not book-quoted',
   sportsbookOddsVerified:false},
  ballDontLieFree:{dailyCacheReady:available,paidStatsOrPropEndpointsUsed:false},
  blockers:[...(!cron?['CRON_SECRET_MISSING']:[]),
   ...(!storage.configured?['BLOB_STORAGE_NOT_CONFIGURED']:[])],
  nextStep:available?'Check the next scheduled collector run and saved snapshot.':
   !cron?'Configure CRON_SECRET for this deployment environment before enabling authenticated scheduled collection.':
   'Ensure the existing Vercel Blob store is attached. Either modern BLOB_STORE_ID with Vercel OIDC or a legacy BLOB_READ_WRITE_TOKEN is supported.'};
}
export default function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 return res.status(200).json(pregameReadiness(process.env));
}
