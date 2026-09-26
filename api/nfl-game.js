import { put, list } from '@vercel/blob';
const ESPN="https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const ESPN_STATS="https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/statistics/byathlete";
const ESPN_INJ="https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries";
const HISTORY_PREFIX='momentum-history/v1/nfl-';
const noStore={"Cache-Control":"no-store, max-age=0","Pragma":"no-cache"};
async function json(url){const r=await fetch(url,{headers:{"accept":"application/json"}});if(!r.ok)throw new Error("upstream_"+r.status);return r.json()}
async function projections(competitors){
 const out=[];
 for(const c of competitors){const team=c.team||{},abbr=String(team.abbreviation||'').toUpperCase(),teamKey=abbr||String(team.id||'');if(!teamKey)continue;try{const d=await json(ESPN+'/teams/'+encodeURIComponent(teamKey)+'/roster');const groups=Array.isArray(d.athletes)?d.athletes:[];const rows=groups.flatMap(g=>Array.isArray(g.items)?g.items:Array.isArray(g.athletes)?g.athletes:[]);for(const a of rows){const pos=a.position?.abbreviation||a.position?.name||null;if(!['QB','RB','WR','TE'].includes(pos))continue;out.push({playerId:String(a.id||''),name:a.displayName||a.fullName||a.name||'Unknown',team:abbr,position:pos,stats:[],source:'ESPN current team roster'})}}catch(e){}}
 const balanced=[]; for(const c of competitors){const abbr=String(c.team?.abbreviation||'').toUpperCase();balanced.push(...out.filter(x=>x.team===abbr).slice(0,12))} return balanced;
}
const statusMap=s=>{const x=String(s||"").toLowerCase();if(x.includes("out"))return"OUT";if(x.includes("doubt"))return"DOUBTFUL";if(x.includes("question"))return"QUESTIONABLE";if(x.includes("injured reserve")||x==="ir")return"IR";return x?"ACTIVE":"UNKNOWN"};

const hnum=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null};
async function readHistory(gameId){try{const path=HISTORY_PREFIX+gameId+'.json',x=await list({prefix:path,limit:5}),b=x.blobs?.find(v=>v.pathname===path);if(!b)return null;const r=await fetch(b.url,{cache:'no-store'});return r.ok?r.json():null}catch{return null}}
async function listHistory(){try{const x=await list({prefix:HISTORY_PREFIX,limit:100});const rows=await Promise.all((x.blobs||[]).map(async b=>{try{const r=await fetch(b.url,{cache:'no-store'});return r.ok?r.json():null}catch{return null}}));return rows.filter(Boolean).sort((a,b)=>String(b.lockedAt||'').localeCompare(String(a.lockedAt||'')))}catch{return[]}}
async function lockHistory(gameId,body){const old=await readHistory(gameId);if(old)return old;const snap={league:'nfl',gameId,lockedAt:new Date().toISOString(),game:body.game||null,picks:body.picks||[],sgps:body.sgps||[]};await put(HISTORY_PREFIX+gameId+'.json',JSON.stringify(snap),{access:'public',addRandomSuffix:false,allowOverwrite:true});return snap}
function finalStats(summary){const out=new Map();for(const team of summary.boxscore?.players||[])for(const group of team.statistics||[]){const labels=(group.labels||group.names||[]).map(x=>String(x).toUpperCase()),gn=String(group.name||group.displayName||'').toLowerCase();for(const row of group.athletes||[]){const id=String(row.athlete?.id||row.id||'');if(!id)continue;const o=out.get(id)||{},m={};labels.forEach((k,i)=>m[k]=hnum(row.stats?.[i]));if(gn.includes('passing'))o.passing=m.YDS;if(gn.includes('rushing')){o.rushing=m.YDS;o.rushTD=m.TD}if(gn.includes('receiv')){o.receptions=m.REC;o.receiving=m.YDS;o.recTD=m.TD}out.set(id,o)}}return out}
function gradeHistory(p,stats){const a=stats.get(String(p.playerID||p.playerId||'')),cat=String(p.category||p.cat||'').toLowerCase();if(!a)return{status:'UNGRADABLE',actual:null,target:null,margin:null};const actual=cat==='td'?(a.rushTD||0)+(a.recTD||0):a[cat],target=p.threshold??p.line??(cat==='td'?0.5:null);if(actual==null||target==null)return{status:'UNGRADABLE',actual,target,margin:null};const margin=Number(actual)-Number(target);return{status:margin>0?'HIT':'MISS',actual:Number(actual),target:Number(target),margin}}

export default async function handler(req,res){
 Object.entries(noStore).forEach(([k,v])=>res.setHeader(k,v));
 if(req.method==='GET'&&String(req.query.mode||'')==='history-list')return res.status(200).json({ok:true,history:await listHistory()}); const gameId=String(req.query.gameId||req.body?.gameId||""); if(!gameId)return res.status(400).json({ok:false,error:"gameId_required"});if(req.method==='POST'&&req.body?.action==='lock-history'){try{return res.status(200).json({ok:true,locked:await lockHistory(gameId,req.body)})}catch(e){return res.status(502).json({ok:false,error:'history_lock_failed'})}}
 try{
  const summary=await json(`${ESPN}/summary?event=${encodeURIComponent(gameId)}`);
  const comp=summary.header?.competitions?.[0]||{}; const competitors=comp.competitors||[];
  const allowedIds=new Set(competitors.map(c=>String(c.team?.id||"")).filter(Boolean)); const allowedAbbr=new Set(competitors.map(c=>String(c.team?.abbreviation||"").toUpperCase()).filter(Boolean));
  let injuryGroups=summary.injuries||[];if(!injuryGroups.length){try{const leagueInj=await json(ESPN_INJ);injuryGroups=leagueInj.injuries||leagueInj.items||[]}catch(e){}}
  const injuries=(injuryGroups||[]).filter(team=>allowedIds.has(String(team.team?.id||""))||allowedAbbr.has(String(team.team?.abbreviation||"").toUpperCase())).flatMap(team=>(team.injuries||[]).map(i=>({
    team:team.team?.abbreviation||team.team?.displayName||null,playerId:String(i.athlete?.id||""),name:i.athlete?.displayName||i.athlete?.fullName||"Unknown",
    position:i.athlete?.position?.abbreviation||null,injury:i.details?.type||i.type?.description||i.details?.detail||null,
    status:statusMap(i.status||i.details?.status),rawStatus:i.status||i.details?.status||null,source:"ESPN game summary"
  })));
  const athleteTeam=new Map(); for(const t of (summary.rosters||[])){const ta=String(t.team?.abbreviation||"").toUpperCase();for(const a of (t.roster||t.athletes||[])){const id=String(a.athlete?.id||a.id||"");if(id)athleteTeam.set(id,ta)}}
  const scopedInjuries=injuries.filter(x=>allowedAbbr.has(String(x.team||"").toUpperCase())||allowedAbbr.has(athleteTeam.get(x.playerId)||""));
  const blockers=scopedInjuries.filter(x=>["OUT","DOUBTFUL","IR"].includes(x.status));
  const teams=competitors.map(c=>({id:String(c.team?.id||""),abbr:c.team?.abbreviation,name:c.team?.displayName,homeAway:c.homeAway}));
  if(String(req.query.mode||'')==='history-grade'){const locked=await readHistory(gameId),stats=finalStats(summary),final=String(comp.status?.type?.state||'').toLowerCase()==='post'||/final/i.test(String(comp.status?.type?.description||'')),score=competitors.map(c=>({team:c.team?.abbreviation||'',homeAway:c.homeAway,score:hnum(c.score)})),picks=(locked?.picks||[]).map(p=>({...p,grade:gradeHistory(p,stats)})),sgps=(locked?.sgps||[]).map(s=>{const legs=(s.legs||[]).map(p=>({...p,grade:gradeHistory(p,stats)}));return{...s,legs,legsHit:legs.filter(x=>x.grade.status==='HIT').length,legsTotal:legs.length,hit:legs.length>0&&legs.every(x=>x.grade.status==='HIT')}});return res.status(200).json({ok:true,gameId,final,teams:score,picks,sgps,lockedAt:locked?.lockedAt||null,gradedAt:new Date().toISOString()})}
  const playerProjections=await projections(competitors);
  return res.status(200).json({ok:true,gameId,teams,injuries:scopedInjuries,blockers,playerProjections,eligibility:{ready:true,state:"ANALYTICS_READY",reason:"Core matchup, roster and injury analytics remain available independently of sportsbook market verification."},fetchedAt:new Date().toISOString(),source:"ESPN cross-check; NFL/team authority remains required for final eligibility"});
 }catch(e){return res.status(502).json({ok:false,gameId,error:e.message,fetchedAt:new Date().toISOString()})}
}