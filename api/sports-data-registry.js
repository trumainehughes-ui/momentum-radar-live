import {getSportsDataConfig} from '../lib/sports-data-registry.js';
export default function handler(req,res) {
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
  const league=String(req.query?.league||'').trim().toUpperCase();
  if(!league)return res.status(200).json({ok:true,source:'momentum_radar_registry',leagues:['NBA','NFL','MLB','WNBA','NHL','NCAAF','NCAAB'],sportsbookVerified:false});
  const config=getSportsDataConfig(league);
  return res.status(config.ok?200:400).json({source:'momentum_radar_registry',...config});
}
