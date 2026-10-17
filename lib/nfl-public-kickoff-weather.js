// Safe public venue-level weather (not a player projection).
// Coordinates are approximate stadium areas and never accepted from clients.
import {fetchNwsStadiumForecast} from './nfl-weather-nws.js';

const US={
 ARI:[33.528,-112.263],ATL:[33.755,-84.401],BAL:[39.279,-76.623],BUF:[42.773,-78.787],
 CAR:[35.226,-80.852],CHI:[41.862,-87.617],CIN:[39.095,-84.516],CLE:[41.506,-81.699],
 DAL:[32.748,-97.093],DEN:[39.744,-105.020],DET:[42.340,-83.046],GB:[44.501,-88.062],
 HOU:[29.684,-95.410],IND:[39.760,-86.164],JAX:[30.324,-81.637],KC:[39.048,-94.483],
 LV:[36.090,-115.184],LAC:[33.953,-118.339],LAR:[33.953,-118.339],MIA:[25.958,-80.239],
 MIN:[44.974,-93.259],NE:[42.091,-71.264],NO:[29.951,-90.081],NYG:[40.813,-74.074],
 NYJ:[40.813,-74.074],PHI:[39.901,-75.167],PIT:[40.447,-80.016],SF:[37.403,-121.969],
 SEA:[47.595,-122.332],TB:[27.976,-82.503],TEN:[36.166,-86.771],WAS:[38.907,-76.864],
 WSH:[38.907,-76.864]
};
const INDOOR=new Set(['DET','MIN','NO','LV','LAR','LAC']);
const MAY_RETRACT=new Set(['ARI','ATL','DAL','HOU','IND']);
export function trustedGameWeatherSite(game){
 if(!game||!Number.isFinite(Date.parse(game.kickoff||'')))throw Error('invalid_game');
 const stadium=String(game.venue||'');
 if(/Wembley|Tottenham Hotspur/i.test(stadium))
  return{location:'London, UK',lat:51.556,long:-0.279,mode:'OUTDOOR',international:true};
 if(/Munich|Allianz Arena/i.test(stadium))
  return{location:'Munich, Germany',lat:48.218,long:11.624,mode:'OUTDOOR',international:true};
 if(/Frankfurt|Deutsche Bank Park/i.test(stadium))
  return{location:'Frankfurt, Germany',lat:50.068,long:8.645,mode:'OUTDOOR',international:true};
 if(/Madrid|Santiago Bernab/i.test(stadium))
  return{location:'Madrid, Spain',lat:40.453,long:-3.688,mode:'COVERED_OR_RETRACTABLE',international:true};
 const team=String(game.home?.abbr||'').toUpperCase(),coords=US[team];
 if(!coords)return null;
 return{location:stadium||team+' stadium area',lat:coords[0],long:coords[1],
  mode:INDOOR.has(team)?'INDOOR':MAY_RETRACT.has(team)?'COVERED_OR_RETRACTABLE':'OUTDOOR',
  international:false};
}
const number=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max?n:null;
function validatedWeather({tempF,windMph,rainChancePct,condition,source,checkedAt,site,kickoffAt}){
 if(number(tempF,-100,150)===null||number(windMph,0,150)===null)
  throw Error('forecast_missing_fields');
 return {status:'FORECAST_AVAILABLE',source,checkedAt,
  validAt:kickoffAt,location:site.location,venueMode:site.mode,
  temperatureF:tempF,windMph,rainChancePct:number(rainChancePct,0,100),
  condition:String(condition||'Forecast').slice(0,120),
  message:'Venue-area kickoff forecast; roof configuration and conditions may change. No sportsbook line or model prediction is adjusted by this display.'};
}
export async function fetchPublicKickoffWeather(game,{fetcher=fetch,now=Date.now()}={}){
 const site=trustedGameWeatherSite(game);
 if(!site)return{status:'VENUE_NOT_MAPPED',message:'Weather location needs verification.'};
 const kickoff=Date.parse(game.kickoff);
 if(!Number.isFinite(kickoff)||Math.abs(kickoff-now)>16*86400000)
  return{status:'OUTSIDE_FORECAST_RANGE',message:'Kickoff forecast is not available yet.'};
 if(site.mode==='INDOOR')return{status:'INDOOR',venueMode:site.mode,
  location:site.location,message:'Indoor stadium · Outdoor weather is unlikely to affect play.'};
 if(!site.international){
  try{
   const w=await fetchNwsStadiumForecast({
    latitude:site.lat,longitude:site.long,kickoffAt:game.kickoff,fetcher,now});
   return validatedWeather({tempF:w.temperatureF,windMph:w.windMph,
    rainChancePct:w.precipProbabilityPct,condition:w.shortForecast,
    source:w.source,checkedAt:w.checkedAt,site,kickoffAt:game.kickoff});
  }catch{return{status:'FORECAST_NOT_READY',venueMode:site.mode,
   location:site.location,message:'Kickoff forecast is being updated.'};}
 }
 // For international games where NOAA does not cover the venue.
 // Open-Meteo licensing must be reviewed if the service becomes commercial.
 const url='https://api.open-meteo.com/v1/forecast?'+new URLSearchParams({
  latitude:String(site.lat),longitude:String(site.long),
  hourly:'temperature_2m,precipitation_probability,wind_speed_10m',
  temperature_unit:'fahrenheit',wind_speed_unit:'mph',
  timezone:'GMT',forecast_days:'16'
 });
 try{
  const r=await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(8500)});
  if(!r.ok)throw Error('international_forecast_http');
  const d=await r.json();
  const hours=d.hourly?.time||[];
  const target=new Date(kickoff).toISOString().slice(0,13);
  const ix=hours.findIndex(h=>String(h).slice(0,13)===target);
  if(ix<0)throw Error('hourly_forecast_not_ready');
  return validatedWeather({tempF:number(d.hourly.temperature_2m?.[ix],-100,150),
   windMph:number(d.hourly.wind_speed_10m?.[ix],0,150),
   rainChancePct:number(d.hourly.precipitation_probability?.[ix],0,100),
   source:'Open-Meteo',checkedAt:new Date(now).toISOString(),site,kickoffAt:game.kickoff});
 }catch{return{status:'FORECAST_NOT_READY',venueMode:site.mode,
  location:site.location,message:'Kickoff forecast is being updated.'};}
}
