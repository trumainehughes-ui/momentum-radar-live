// ESPN NBA game evidence. Box score totals are actual results, never future prop predictions.
export const NBA_CATEGORIES=Object.freeze(['points','rebounds','assists','threes','pra']);
export const NBA_TIERS=Object.freeze({
 Small:{min:4,max:4,categories:3,elevated:false},
 Medium:{min:5,max:5,categories:3,elevated:false},
 Nuke:{min:5,max:7,categories:3,elevated:true}
});
const str=(x,n=120)=>String(x??'').slice(0,n);
const num=x=>{if(x===null||x===undefined||x==='')return null;const n=Number(x);return Number.isFinite(n)&&n>=0?n:null};
const team=x=>str(x?.team?.abbreviation||x?.abbreviation,7).toUpperCase();
const status=x=>{
 const t=x?.type||x||{},state=str(t.state).toLowerCase(),text=str(t.name||t.description).toLowerCase();
 if(state==='post'||/final|completed/.test(text))return 'FINAL';
 if(state==='in'||/in progress|halftime|end of|quarter/.test(text))return 'LIVE';
 if(/postponed|canceled|cancelled/.test(text))return 'POSTPONED';
 return 'SCHEDULED';
};
export function parseNbaScoreboard(raw,date){
 const games=[];
 for(const e of Array.isArray(raw?.events)?raw.events:[]){
  const c=e?.competitions?.[0]||{},parts=c.competitors||[],
   home=parts.find(x=>x.homeAway==='home'),away=parts.find(x=>x.homeAway==='away'),
   h=team(home),a=team(away),gameId=str(e.id,24),tip=str(e.date||c.date,40);
  if(!/^\d{7,12}$/.test(gameId)||!h||!a||h===a||!Number.isFinite(Date.parse(tip)))continue;
  const st=status(c.status||e.status),score=x=>['SCHEDULED','POSTPONED'].includes(st)?null:num(x?.score);
  games.push({gameId,kickoff:tip,status:st,
   stage:e?.season?.type===1?'PRESEASON':e?.season?.type===2?'REGULAR SEASON':e?.season?.type===3?'PLAYOFFS':'NBA',
   home:{id:str(home?.team?.id,16),abbr:h,name:str(home?.team?.displayName),score:score(home)},
   away:{id:str(away?.team?.id,16),abbr:a,name:str(away?.team?.displayName),score:score(away)},
   venue:str(c.venue?.fullName)});
 }
 games.sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
 return {ok:true,date,games,source:'ESPN NBA scoreboard',fetchedAt:new Date().toISOString(),
   coverage:{games:games.length,marketVerified:false},note:'No player projections or verified sportsbook props are implied by a schedule.'};
}
const norm=x=>str(x).toLowerCase().replace(/[^a-z0-9]/g,'');
function parseStats(group,entry){
 const values=entry?.stats||[];
 const names=group?.names?.length===values.length?group.names:group?.labels?.length===values.length?group.labels:[];
 if(!names.length)return null;
 const map=new Map(names.map((n,i)=>[norm(n),values[i]]));
 const get=ns=>ns.map(n=>map.get(norm(n))).find(x=>x!==undefined);
 const made=x=>{if(x===undefined)return null;const v=String(x);return num(v.includes('-')?v.split('-')[0]:v)};
 const rawMinutes=get(['minutes','min']);
 const parseMinutes=v=>{
  if(v===undefined||v===null)return null;
  const text=String(v).trim();
  if(/^\\d{1,2}:\\d{2}$/.test(text)){
   const [m,s]=text.split(':').map(Number);
   return m<=60&&s<60?Number((m+s/60).toFixed(2)):null;
  }
  const n=Number(text);
  return Number.isFinite(n)&&n>=0&&n<=60?n:null;
 };
 const minutes=parseMinutes(rawMinutes);
 const points=num(get(['points','pts'])),rebounds=num(get(['rebounds','reb','totalRebounds'])),
 assists=num(get(['assists','ast'])),
 threes=made(get(['threePointFieldGoalsMade','threePointsMade','3PT','3PM','threePointFieldGoals','threePointers']));
 if([points,rebounds,assists,threes].every(x=>x===null))return null;
 return {points,rebounds,assists,threes,minutes,
   pra:points!==null&&rebounds!==null&&assists!==null?points+rebounds+assists:null};
}
export function nbaNotReadyTiers(reason){
 return Object.entries(NBA_TIERS).map(([risk,tier])=>({
  risk,status:'NOT_READY',reason,legs:[],combinedBookOdds:null,combinedBookOddsVerified:false,
  requires:tier.min+'–'+tier.max+' eligible legs, '+tier.categories+'+ categories'
 }));
}
export function parseNbaGame(raw,gameId){
 const comp=raw?.header?.competitions?.[0]||{},parts=comp.competitors||[],
  h=parts.find(x=>x.homeAway==='home'),a=parts.find(x=>x.homeAway==='away'),
  home=team(h),away=team(a),allowed=new Set([home,away].filter(Boolean)),
  reported=str(comp.id||raw?.header?.id,24);
 if(!/^\d{7,12}$/.test(String(gameId))||allowed.size!==2)
  return {ok:false,error:'nba_game_identity_unverified'};
 if(reported&&reported!==String(gameId))return {ok:false,error:'nba_game_id_mismatch'};
 const st=status(comp.status||raw?.header?.status),players=[],seen=new Set();
 if(['LIVE','FINAL'].includes(st))for(const side of raw?.boxscore?.players||[]){
  const t=team(side);if(!allowed.has(t))continue;
  for(const group of side?.statistics||[])for(const row of group?.athletes||[]){
   const athlete=row.athlete||row,id=str(athlete?.id||row.id,24),
    name=str(athlete?.displayName||athlete?.fullName||row.displayName),key=t+':'+id;
   if(!/^\d{2,14}$/.test(id)||!name||seen.has(key))continue;
   const data=parseStats(group,row);if(!data)continue;
   seen.add(key);
   players.push({playerId:id,name,team:t,position:str(athlete?.position?.abbreviation,6)||null,
    ...data,statType:'ACTUAL_GAME_RESULT',source:'ESPN box score'});
  }
 }
 const injuries=[];
 for(const group of raw?.injuries||[]){
  const t=team(group);if(!allowed.has(t))continue;
  for(const item of group.injuries||[]){
   const name=str(item?.athlete?.displayName||item?.athlete?.fullName);
   if(!name)continue;
   injuries.push({name,team:t,status:str(item.status||'Unknown',40),
    detail:str(item?.details?.detail||item?.shortComment,140),
    source:'ESPN injury report, official inactives unverified'});
  }
 }
 return {ok:true,gameId:String(gameId),status:st,
  matchup:{home:{abbr:home,name:str(h?.team?.displayName)},away:{abbr:away,name:str(a?.team?.displayName)}},
  players,injuries,source:'ESPN NBA game summary',fetchedAt:new Date().toISOString(),
  validation:{gameIdentityChecked:true,playerGameIdentityChecked:true,observedBoxscoreOnly:true,
   pregameProjectionsAvailable:false,officialInactivesVerified:false,sportsbookMarketsVerified:false,combinedSgpOddsVerified:false},
  sgps:nbaNotReadyTiers('Pregame player projections, injury/rotation eligibility and available sportsbook alternatives need verification before creating any SGP.')};
}
export function validateNbaSgp(risk,legs,{gameId,home,away,verifiedPlayers=new Map()}={}){
 const cfg=NBA_TIERS[risk],reasons=[];
 if(!cfg)return{publishable:false,reasons:['invalid_tier']};
 if(!Array.isArray(legs)||legs.length<cfg.min||legs.length>cfg.max)reasons.push('invalid_leg_count');
 const seen=new Set(),types=new Set();
 for(const leg of Array.isArray(legs)?legs:[]){
  const id=str(leg?.playerId,24),cat=str(leg?.category,25),player=verifiedPlayers.get(id);
  const selectionKey=id+'|'+cat;
  if(!id||seen.has(selectionKey))reasons.push('duplicated_player_market');
  seen.add(selectionKey);
  if(!NBA_CATEGORIES.includes(cat))reasons.push('invalid_category');types.add(cat);
  if(!player||player.team!==leg.team||!['ACTIVE','PROBABLE'].includes(player.status)||
    ![home,away].includes(leg.team)||String(leg.gameId)!==String(gameId))
   reasons.push('unverified_game_roster_availability');
  const prediction=num(leg.projection),target=num(leg.threshold);
  if(prediction===null||target===null)reasons.push('missing_projection_or_target');
  else if(cfg.elevated&&target<=prediction)reasons.push('nuke_target_not_elevated');
  if(leg.verifiedMarket!==true)reasons.push('market_not_verified');
 }
 if(types.size<cfg.categories)reasons.push('insufficient_prop_category_mix');
 return {publishable:reasons.length===0,reasons:[...new Set(reasons)],tier:risk};
}
