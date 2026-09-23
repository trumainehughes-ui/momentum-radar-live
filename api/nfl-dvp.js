import { put, list } from '@vercel/blob';

const ESPN='https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const PREFIX='nfl-dvp/v1/';
const TTL=60*60*1000;
const EDGE='public, s-maxage=900, stale-while-revalidate=21600';
const POSITIONS=['QB','RB','WR','TE'];

async function json(url){
  const r=await fetch(url,{cache:'no-store',headers:{accept:'application/json'}});
  if(!r.ok)throw new Error('upstream_'+r.status);
  return r.json();
}
const n=v=>{const x=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(x)?x:0};
const norm=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const empty=()=>({
  games:0,
  QB:{attempts:0,completions:0,passYards:0,passTD:0,interceptions:0,rushAttempts:0,rushYards:0,rushTD:0},
  RB:{rushAttempts:0,rushYards:0,rushTD:0,targets:0,receptions:0,recYards:0,recTD:0},
  WR:{rushAttempts:0,rushYards:0,rushTD:0,targets:0,receptions:0,recYards:0,recTD:0},
  TE:{rushAttempts:0,rushYards:0,rushTD:0,targets:0,receptions:0,recYards:0,recTD:0}
});
function team(map,abbr){if(!map[abbr])map[abbr]=empty();return map[abbr]}
function labels(group,stats){
  const out={};
  const ls=group.labels||group.names||[];
  ls.forEach((k,i)=>out[String(k||'').toUpperCase()]=stats?.[i]);
  return out;
}
function athletePos(a){
  return String(a?.athlete?.position?.abbreviation||a?.position?.abbreviation||a?.athlete?.position?.name||'').toUpperCase();
}
function addPassing(bucket,group,a){
  const m=labels(group,a.stats), ca=String(m['C/ATT']||m['COMP/ATT']||'0/0').split('/');
  bucket.completions+=n(ca[0]);bucket.attempts+=n(ca[1]);
  bucket.passYards+=n(m.YDS);bucket.passTD+=n(m.TD);bucket.interceptions+=n(m.INT);
}
function addRushing(bucket,group,a){
  const m=labels(group,a.stats);bucket.rushAttempts+=n(m.CAR||m.ATT);bucket.rushYards+=n(m.YDS);bucket.rushTD+=n(m.TD);
}
function addReceiving(bucket,group,a){
  const m=labels(group,a.stats);bucket.receptions+=n(m.REC);bucket.recYards+=n(m.YDS);bucket.recTD+=n(m.TD);bucket.targets+=n(m.TGTS||m.TGT);
}
function mergeGame(target,block){
  for(const g of block.statistics||[]){
    const name=String(g.name||g.displayName||g.type||'').toLowerCase();
    for(const a of g.athletes||[]){
      const pos=athletePos(a);
      if(!POSITIONS.includes(pos))continue;
      if(name.includes('passing')&&pos==='QB')addPassing(target.QB,g,a);
      else if(name.includes('rushing'))addRushing(target[pos],g,a);
      else if(name.includes('receiv'))addReceiving(target[pos],g,a);
    }
  }
}
function rankMaps(all){
  const metrics={
    QB:['passYards','passTD','completions','attempts','rushYards','rushTD'],
    RB:['rushYards','rushTD','receptions','targets','recYards','recTD'],
    WR:['receptions','targets','recYards','recTD','rushYards','rushTD'],
    TE:['receptions','targets','recYards','recTD']
  };
  const ranks={};
  for(const p of POSITIONS){
    ranks[p]={};
    for(const metric of metrics[p]){
      const rows=Object.entries(all).map(([abbr,v])=>({abbr,value:n(v[p]?.[metric])})).sort((a,b)=>b.value-a.value);
      rows.forEach((x,i)=>{if(!ranks[p][x.abbr])ranks[p][x.abbr]={};ranks[p][x.abbr][metric]={rankMost:i+1,value:x.value}});
    }
  }
  return ranks;
}
function perGame(v){
  const g=Math.max(1,n(v.games)),out={games:n(v.games)};
  for(const p of POSITIONS){out[p]={};for(const [k,val] of Object.entries(v[p]||{}))out[p][k]=Math.round((n(val)/g)*10)/10}
  return out;
}
async function readSnapshot(key){
  try{
    const path=PREFIX+key+'.json',x=await list({prefix:path,limit:5}),b=x.blobs?.find(v=>v.pathname===path);
    if(!b)return null;
    const r=await fetch(b.url,{cache:'no-store'});if(!r.ok)return null;
    return r.json();
  }catch{return null}
}
async function writeSnapshot(key,data){
  try{await put(PREFIX+key+'.json',JSON.stringify(data),{access:'public',addRandomSuffix:false,allowOverwrite:true})}catch{}
}
async function build(season,week){
  const defense={},offense={},gameIds=[];
  for(let w=1;w<=week;w++){
    const board=await json(ESPN+'/scoreboard?dates='+season+'&seasontype=2&week='+w+'&limit=100');
    for(const e of board.events||[]){
      const c=e.competitions?.[0]||{},state=String(c.status?.type?.state||e.status?.type?.state||'').toLowerCase();
      if(state!=='post')continue;
      if(e.id)gameIds.push(String(e.id));
    }
  }
  const unique=[...new Set(gameIds)];
  for(let i=0;i<unique.length;i+=6){
    const chunk=unique.slice(i,i+6);
    const summaries=await Promise.all(chunk.map(id=>json(ESPN+'/summary?event='+encodeURIComponent(id)).catch(()=>null)));
    for(const s of summaries.filter(Boolean)){
      const comp=s.header?.competitions?.[0]||{},cs=comp.competitors||[];
      const teams=cs.map(c=>String(c.team?.abbreviation||'').toUpperCase()).filter(Boolean);
      if(teams.length!==2)continue;
      const blocks=s.boxscore?.players||[];
      for(const block of blocks){
        const off=String(block.team?.abbreviation||'').toUpperCase();if(!off)continue;
        const def=teams.find(x=>x!==off);if(!def)continue;
        const o=team(offense,off),d=team(defense,def);
        mergeGame(o,block);mergeGame(d,block);
      }
      teams.forEach(t=>{team(defense,t).games+=1;team(offense,t).games+=1});
    }
  }
  const defensePerGame=Object.fromEntries(Object.entries(defense).map(([k,v])=>[k,perGame(v)]));
  const offensePerGame=Object.fromEntries(Object.entries(offense).map(([k,v])=>[k,perGame(v)]));
  return {
    season,week,completedGames:unique.length,
    defense:defensePerGame,offense:offensePerGame,
    defenseRanks:rankMaps(defensePerGame),offenseRanks:rankMaps(offensePerGame),
    methodology:'Position splits are derived from completed ESPN NFL box scores, grouped by the offensive player position and assigned to the opposing defense. Rank #1 means most allowed/produced per game.',
    officialValidation:{
      source:'NFL.com',
      defensePassing:'https://www.nfl.com/stats/team-stats/defense/passing/'+season+'/reg/all',
      defenseRushing:'https://www.nfl.com/stats/team-stats/defense/rushing/'+season+'/reg/all',
      offensePassing:'https://www.nfl.com/stats/team-stats/offense/passing/'+season+'/reg/all',
      offenseRushing:'https://www.nfl.com/stats/team-stats/offense/rushing/'+season+'/reg/all',
      note:'NFL.com official team totals are the validation reference. NFL.com does not expose the position-split table through a stable unauthenticated public API, so QB/RB/WR/TE splits are computed from game box scores.'
    },
    generatedAt:new Date().toISOString()
  };
}
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  try{
    const season=Math.max(2020,Math.min(2100,Number(req.query.season)||new Date().getUTCFullYear()));
    const week=Math.max(1,Math.min(18,Number(req.query.week)||1));
    const key=season+'-w'+week;
    let snap=await readSnapshot(key),fresh=snap&&Date.now()-Date.parse(snap.generatedAt||0)<TTL;
    if(!fresh){snap=await build(season,week);await writeSnapshot(key,snap)}
    const requested=String(req.query.teams||'').split(',').map(norm).filter(Boolean);
    const select=obj=>requested.length?Object.fromEntries(Object.entries(obj||{}).filter(([k])=>requested.includes(norm(k)))):obj;
    const filterRanks=r=>{
      if(!requested.length)return r;
      const out={};for(const p of POSITIONS){out[p]={};for(const [k,v] of Object.entries(r?.[p]||{}))if(requested.includes(norm(k)))out[p][k]=v}return out;
    };
    res.setHeader('Cache-Control',EDGE);res.setHeader('CDN-Cache-Control',EDGE);res.setHeader('Vercel-CDN-Cache-Control',EDGE);
    return res.status(200).json({ok:true,...snap,defense:select(snap.defense),offense:select(snap.offense),defenseRanks:filterRanks(snap.defenseRanks),offenseRanks:filterRanks(snap.offenseRanks),cache:{fresh:Boolean(fresh),ttlMinutes:60}});
  }catch(e){return res.status(502).json({ok:false,error:String(e.message||e),fetchedAt:new Date().toISOString()})}
}
