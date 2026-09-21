import {apiSports} from './_api-sports.js';
const ESPN={nfl:'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',nba:'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard'};
const valid=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||'')), compact=x=>x.replaceAll('-','');
async function espn(sport,date){const r=await fetch(ESPN[sport]+'?dates='+compact(date)+'&limit=100',{cache:'no-store'});if(!r.ok)throw new Error('espn_'+r.status);return r.json()}
function rows(d){return (d?.events||[]).map(e=>{const c=e.competitions?.[0]||{},cs=c.competitors||[],h=cs.find(x=>x.homeAway==='home'),a=cs.find(x=>x.homeAway==='away');return{id:e.id,kickoff:e.date,status:c.status?.type?.description||e.status?.type?.description||'',home:{id:h?.team?.id,name:h?.team?.displayName,abbr:h?.team?.abbreviation},away:{id:a?.team?.id,name:a?.team?.displayName,abbr:a?.team?.abbreviation}}})}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const sport=String(req.query.sport||'nfl').toLowerCase(),date=String(req.query.date||new Date().toISOString().slice(0,10));
 if(!ESPN[sport]||!valid(date))return res.status(400).json({ok:false,error:'invalid_request'});
 let primary=null,secondary=null,secondaryError=null;
 try{primary=await espn(sport,date)}catch(e){return res.status(503).json({ok:false,error:String(e.message||e)})}
 try{secondary=await apiSports({sport,path:'games',query:{date},kind:'schedule'})}catch(e){secondaryError=String(e.message||e)}
 const p=rows(primary),apiRows=secondary?.data?.response||[];
 return res.status(200).json({ok:true,sport,date,primary:{source:'ESPN',games:p},crossCheck:{source:'API-Sports',available:Boolean(secondary),cache:secondary?.cache||null,error:secondaryError,gameCount:apiRows.length},policy:'ESPN remains primary. API-Sports is a quota-aware cross-check and never replaces current data when its plan blocks an endpoint.',fetchedAt:new Date().toISOString()});
}
