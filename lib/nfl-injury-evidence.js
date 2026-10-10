// Injury-evidence normalization: ESPN is a useful tracker, not complete weekly
// NFL game designations. A source checked now is not necessarily published now.
const teamKey=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const nameKey=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function nflInjuryStatus(raw){
 const s=String(raw||'').toUpperCase().replace(/[_-]/g,' ').trim();
 if(!s)return 'UNKNOWN';
 if(/INJURED RESERVE|RESERVE\/INJURED|\bIR\b|\bPUP\b|NON FOOTBALL INJURY|\bNFI\b/.test(s))return 'IR';
 if(/\bINACTIVE\b|NOT ACTIVE/.test(s))return 'INACTIVE';
 if(/\bOUT\b|RULED OUT/.test(s))return 'OUT';
 if(/\bDOUBTFUL\b/.test(s))return 'DOUBTFUL';
 if(/\bQUESTIONABLE\b/.test(s))return 'QUESTIONABLE';
 if(/\bPROBABLE\b/.test(s))return 'PROBABLE';
 if(/\bACTIVE\b|AVAILABLE|HEALTHY|FULL PARTICIPATION/.test(s))return 'ACTIVE';
 return 'REPORTED_OTHER';
}
export const nflInjuryBlocks=x=>['IR','INACTIVE','OUT','DOUBTFUL'].includes(x);
const isReserve=s=>s==='IR';
const byTeamAndName=(team,name)=>teamKey(team)+'|'+nameKey(name);
export function nflGameInjuryEvidence({summary=null,league=null,weekly=null,competitors=null,checkedAt=new Date().toISOString()}={}){
 const teams=competitors||summary?.header?.competitions?.[0]?.competitors||[];
 const ids=new Set(teams.map(t=>String(t.team?.id||'')).filter(Boolean));
 const abbrs=new Set(teams.map(t=>teamKey(t.team?.abbreviation)).filter(Boolean));
 const teamFor=g=>{
  const team=g.team||{},abbr=teamKey(team.abbreviation);
  if(abbrs.has(abbr))return abbr;
  const match=teams.find(t=>String(t.team?.id||'')===String(team.id||'')&&ids.has(String(team.id||'')));
  return teamKey(match?.team?.abbreviation);
 };
 const gameGroups=Array.isArray(summary?.injuries)?summary.injuries:null;
 const leagueGroups=Array.isArray(league?.injuries)?league.injuries:Array.isArray(league?.items)?league.items:null;
 const weeklyCoverage=Boolean(weekly?.entries?.length);
 const reportAvailable=Boolean(gameGroups?.length)||leagueGroups!==null||weeklyCoverage;
 const errors=[],rows=new Map(),idKeys=new Map(),nameKeys=new Map();
 const add=(record)=>{
  const k=byTeamAndName(record.team,record.name);
  if(!record.name||!abbrs.has(teamKey(record.team)))return;
  const existingKey=record.playerId&&idKeys.get(String(record.playerId))||nameKeys.get(k);
  const stored=existingKey?rows.get(existingKey):null;
  // A game-specific ESPN report beats ESPN league data, while official current
  // weekly designations beat both. Never overwrite the official entry with ESPN.
  if(stored?.evidenceTier==='WEEKLY_OFFICIAL'&&record.evidenceTier!=='WEEKLY_OFFICIAL')return;
  const out=stored?{...stored,...record,playerId:record.playerId||stored.playerId,
       aliases:[...new Set([...(stored.aliases||[]),...(record.aliases||[])])]}:record;
  const storeKey=existingKey||k;rows.set(storeKey,out);
  if(out.playerId)idKeys.set(String(out.playerId),storeKey);
  nameKeys.set(k,storeKey);
  for(const alias of out.aliases||[])nameKeys.set(byTeamAndName(out.team,alias),storeKey);
 };
 const candidates=[
  ...(gameGroups||[]).map(g=>({group:g,origin:'ESPN game injury report',tier:'ESPN_GAME'})),
  ...(leagueGroups||[]).map(g=>({group:g,origin:'ESPN league injury tracker',tier:'ESPN_LEAGUE'}))
 ];
 for(const {group,origin,tier} of candidates){
  const abbr=teamFor(group);
  if(!abbrs.has(abbr))continue;
  for(const item of group.injuries||[]){
   const athlete=item.athlete||{},playerId=String(athlete.id||''),name=athlete.displayName||athlete.fullName||item.name||'';
   if(!playerId&&!nameKey(name))continue;
   const rawStatus=item.status||item.details?.status||item.details?.type?.description||'';
   const status=nflInjuryStatus(rawStatus);
   if(tier==='ESPN_LEAGUE'&&nameKeys.has(byTeamAndName(abbr,name)))continue;
   add({team:abbr,playerId,name,aliases:[],position:athlete.position?.abbreviation||null,
    injury:item.details?.type||item.type?.description||item.details?.detail||null,
    status,rawStatus:rawStatus||null,source:origin,evidenceTier:tier,
    section:isReserve(status)?'RESERVE':'TRACKER',gameDesignationVerified:false,
    sourcePublishedAt:null,sourceUrl:null});
  }
 }
 if(weeklyCoverage){
  if(weekly?.teams?.map(teamKey).sort().join('|')!==[...abbrs].sort().join('|')){
   errors.push('weekly_game_team_mismatch');
  }else for(const item of weekly.entries||[]){
   const abbr=teamKey(item.team);
   if(!abbrs.has(abbr))continue;
   const aliases=item.aliases||[];
   const identity=[item.name,...aliases].map(n=>nameKeys.get(byTeamAndName(abbr,n))).find(Boolean);
   const prior=identity?rows.get(identity):null;
   const current=nflInjuryStatus(item.status);
   const raw=status=>String(status||'').toUpperCase();
   const existing=prior?.status;
   // Track divergent ESPNs for diagnostics, never hide the official designation.
   if(prior&&existing!==current)errors.push('ESPN_DISAGREES_WITH_OFFICIAL:'+abbr+':'+item.name+':'+raw(existing)+'_VS_'+raw(current));
   add({team:abbr,name:item.name,aliases,playerId:prior?.playerId||'',
    position:item.position||prior?.position||null,injury:item.injury||prior?.injury||null,
    status:current,rawStatus:item.status,source:weekly.source,
    evidenceTier:'WEEKLY_OFFICIAL',section:'WEEKLY',gameDesignationVerified:true,
    sourcePublishedAt:weekly.publishedAt,sourceUrl:weekly.url});
  }
 }
 const injuries=[...rows.values()].sort((a,b)=>a.team.localeCompare(b.team)||
   ({WEEKLY:0,TRACKER:1,RESERVE:2}[a.section]??3)-({WEEKLY:0,TRACKER:1,RESERVE:2}[b.section]??3)||
   a.name.localeCompare(b.name));
 const blockers=injuries.filter(x=>nflInjuryBlocks(x.status));
 const weeklyItems=injuries.filter(x=>x.section==='WEEKLY');
 const reserveItems=injuries.filter(x=>x.section==='RESERVE');
 const trackerItems=injuries.filter(x=>x.section==='TRACKER');
 return {injuries,blockers,weeklyItems,reserveItems,trackerItems,reportAvailable,
  status:!reportAvailable?'REPORT_UNAVAILABLE':weeklyCoverage?'WEEKLY_CROSS_CHECKED':!injuries.length?'NO_ITEMS_REPORTED':'ESPN_REPORT_AVAILABLE',
  weeklyCoverage:weeklyCoverage&&errors.indexOf('weekly_game_team_mismatch')<0,
  weeklySource:weeklyCoverage?weekly.source:null,
  weeklyPublishedAt:weeklyCoverage?weekly.publishedAt:null,
  weeklySourceUrl:weeklyCoverage?weekly.url:null,
  source:weeklyCoverage?'NFL published weekly designations + ESPN tracker':gameGroups?.length?'ESPN game report + league tracker':leagueGroups!==null?'ESPN league tracker':'No verified report',
  checkedAt,sourceUpdatedAt:null,officialInactivesVerified:false,
  officialInactivesSource:null,officialInactivesCheckedAt:null,
  discrepancies:errors,
  caveat:weeklyCoverage?'NFL published weekly report is a dated snapshot, not official final game-day inactives.':
       'ESPN injury tracker may omit current weekly OUT players. Official weekly source not verified for this matchup.'
 };
}
