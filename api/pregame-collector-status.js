// Read-only operational audit for both scheduled league collectors.
// No external scoreboard, sportsbook, AI, paid API or data mutation.
import {readCollectorAudits} from '../lib/pregame-collector-shards.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=30, must-revalidate');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const league=String(req.query?.league||'nfl').toLowerCase();
 if(!['nfl','nba'].includes(league))return res.status(400).json({ok:false,error:'unsupported_league'});
 const out=await readCollectorAudits(league);
 return res.status(out.ok?200:503).json(out);
}
