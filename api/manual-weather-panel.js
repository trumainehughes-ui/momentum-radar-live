// Authenticated, read-only Weather Impact HTML preview.
// Not exposed to the public site and never changes SGPs or sportsbook lines.
import {timingSafeEqual} from 'node:crypto';
import {reviewNflStadiumWeather} from '../lib/nfl-weather-review.js';
import {resolveServerWeatherVenue} from '../lib/nfl-weather-trusted-venue.js';
import {renderNflWeatherImpactPanel} from '../lib/nfl-weather-panel.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'none'; frame-ancestors 'none'");
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const secret=process.env.MANUAL_AI_REVIEW_SECRET;
 const supplied=String(req.headers?.['x-manual-review-secret']||'');
 const a=Buffer.from(supplied),b=Buffer.from(secret||'');
 if(!secret||!supplied||a.length!==b.length||!timingSafeEqual(a,b))
  return res.status(401).json({ok:false,error:'unauthorized'});
 const body=req.body;
 if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>4000)
  return res.status(400).json({ok:false,error:'invalid_payload'});
 try{
  const trustedVenue=resolveServerWeatherVenue({gameId:body.gameId,requestVenue:body.venue});
  const result=await reviewNflStadiumWeather({gameId:body.gameId,venue:trustedVenue});
  const html=renderNflWeatherImpactPanel({assessment:result.assessment,explanation:result.explanation,players:[]});
  res.setHeader('Content-Type','text/html; charset=utf-8');
  return res.status(200).send(html);
 }catch{
  return res.status(422).json({ok:false,error:'weather_preview_unavailable',publicationBlocked:true});
 }
}
