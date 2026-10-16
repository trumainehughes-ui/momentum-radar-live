// Read-only NFL weather analysis endpoint. Accepts source-backed inputs, never publishes SGPs.
// Weather inputs are supplied by an authenticated server integration, not trusted from public requests.
import {timingSafeEqual} from 'node:crypto';
import {buildNflWeatherPlayerReport} from '../lib/nfl-weather-player-report.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const secret=process.env.MANUAL_AI_REVIEW_SECRET;
 const supplied=String(req.headers?.['x-manual-review-secret']||'');
 const a=Buffer.from(supplied),b=Buffer.from(secret||'');
 if(!secret||!supplied||a.length!==b.length||!timingSafeEqual(a,b))return res.status(401).json({ok:false,error:'unauthorized'});
 const input=req.body;
 if(!input||typeof input!=='object'||Array.isArray(input)||JSON.stringify(input).length>50000)
  return res.status(400).json({ok:false,error:'invalid_payload'});
 try{
  const result=buildNflWeatherPlayerReport(input);
  return res.status(200).json({ok:true,...result,paidSportsApiCalls:0,publicationBlocked:true});
 }catch{
  return res.status(422).json({ok:false,error:'weather_report_unavailable',paidSportsApiCalls:0,publicationBlocked:true});
 }
}
