// Admin-only preview of kickoff weather. No sportsbook API usage or SGP publication.
import {timingSafeEqual} from 'node:crypto';
import {reviewNflStadiumWeather} from '../lib/nfl-weather-review.js';
import {resolveVerifiedNflWeatherGame} from '../lib/nfl-weather-verified-game.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const secret=process.env.MANUAL_AI_REVIEW_SECRET;
 const supplied=String(req.headers?.['x-manual-review-secret']||'');
 const a=Buffer.from(supplied),b=Buffer.from(secret||'');
 if(!secret||!supplied||a.length!==b.length||!timingSafeEqual(a,b))
  return res.status(401).json({ok:false,error:'unauthorized'});
 const body=req.body;
 if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>4000)
  return res.status(400).json({ok:false,error:'invalid_payload'});
 const {gameId,venue}=body;
 if(!/^\d{7,12}$/.test(String(gameId||''))||!venue||typeof venue!=='object'||Array.isArray(venue))
  return res.status(400).json({ok:false,error:'invalid_game'});
 try{
  const {venue:trustedVenue}=await resolveVerifiedNflWeatherGame({gameId});
  const report=await reviewNflStadiumWeather({gameId,venue:trustedVenue});
  return res.status(200).json({ok:true,...report});
 }catch{
  return res.status(503).json({ok:false,error:'weather_review_unavailable',paidSportsApiCalls:0,publicationBlocked:true});
 }
}
