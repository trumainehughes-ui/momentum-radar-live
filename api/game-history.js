const NFL='https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const NBA='https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null};
async function json(u){const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw Error('upstream_'+r.status);return r.json()}
function statMap(summary){
 const out=new Map();
 for(const team of summary.boxscore?.players||[])for(const group of team.statistics||[]){
  const labels=(group.labels||group.names||[]).map(x=>String(x).toUpperCase());
  const groupName=String(group.name||group.displayName||'').toLowerCase();
  for(const row of group.athletes||[]){const id=String(row.athlete?.id||row.id||'');if(!id)continue;const o=out.get(id)||{playerId:id,name:row.athlete?.displayName||row.athlete?.fullName||'Unknown'};const vals=row.stats||[],m={};labels.forEach((k,i)=>m[k]=num(vals[i]));
   if(groupName.includes('passing'))o.passingYards=m.YDS;
   if(groupName.includes('rushing')){o.rushingYards=m.YDS;o.rushingTD=m.TD}
   if(groupName.includes('receiv')){o.receptions=m.REC;o.receivingYards=m.YDS;o.receivingTD=m.TD}
   if(groupName.includes('scoring'))o.points=m.PTS;
   if(groupName.includes('rebounds'))o.rebounds=m.REB??m.TOT;
   if(groupName.includes('assists'))o.assists=m.AST;
   if(groupName.includes('three'))o.threes=m['3PM']??m['3PT'];
   out.set(id,o)
  }
 }
 return out
}
function actualFor(p,stats){const a=stats.get(String(p.playerID||p.playerId||''));if(!a)return null;const cat=String(p.category||p.cat||'').toLowerCase();if(cat==='td')return (a.rushingTD||0)+(a.receivingTD||0);if(cat==='passing')return a.passingYards;if(cat==='rushing')return a.rushingYards;if(cat==='receiving')return a.receivingYards;if(cat==='receptions')return a.receptions;if(cat==='points')return a.points;if(cat==='rebounds')return a.rebounds;if(cat==='assists')return a.assists;if(cat==='threes')return a.threes;return null}
function grade(p,actual){const target=p.threshold??p.line??(String(p.category||p.cat||'').toLowerCase()==='td'?0.5:null);if(actual==null||target==null)return{status:'UNGRADABLE',actual,target,margin:null};const margin=actual-Number(target);return{status:margin>0?'HIT':'MISS',actual,target:Number(target),margin}}
export default async function handler(req,res){res.setHeader('Cache-Control','no-store, max-age=0');if(req.method!=='POST'&&req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const gameId=String(req.query.gameId||req.body?.gameId||''),league=String(req.query.league||req.body?.league||'nfl').toLowerCase(),locked=req.body?.locked||null;if(!gameId)return res.status(400).json({ok:false,error:'gameId_required'});
 try{const base=league==='nba'?NBA:NFL,s=await json(base+'/summary?event='+encodeURIComponent(gameId)),c=s.header?.competitions?.[0]||{},status=c.status?.type||s.header?.competitions?.[0]?.status?.type||{},final=String(status.state||'').toLowerCase()==='post'||/final/i.test(String(status.description||status.name||''));const teams=(c.competitors||[]).map(x=>({team:x.team?.abbreviation||x.team?.displayName||'',homeAway:x.homeAway,score:num(x.score)}));const stats=statMap(s);const picks=(locked?.picks||[]).map(p=>({...p,grade:grade(p,actualFor(p,stats))}));const sgps=(locked?.sgps||[]).map(x=>{const legs=(x.legs||[]).map(p=>({...p,grade:grade(p,actualFor(p,stats))}));return{...x,legs,hit:legs.length>0&&legs.every(l=>l.grade.status==='HIT'),legsHit:legs.filter(l=>l.grade.status==='HIT').length,legsTotal:legs.length}});return res.status(200).json({ok:true,league,gameId,state:final?'FINAL':'LIVE',final,teams,picks,sgps,gradedAt:new Date().toISOString(),source:'ESPN final game summary'})}catch(e){return res.status(502).json({ok:false,error:String(e.message||e),gameId,league})}}
