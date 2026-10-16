// NWS hourly forecast adapter for US NFL venues. Caller supplies stadium coordinates.
// This module performs no paid sports-data calls and never creates sportsbook odds.
const finite=(x,min,max)=>Number.isFinite(Number(x))&&x!==null&&x!==''&&Number(x)>=min&&Number(x)<=max?Number(x):null;
function parseWindMph(value){
 const m=String(value||'').match(/^(\d+(?:\.\d+)?)(?:\s*(?:to|-)\s*(\d+(?:\.\d+)?))?\s*mph$/i);
 return m?Number(m[2]||m[1]):null;
}
export async function fetchNwsStadiumForecast({latitude,longitude,kickoffAt,fetcher=fetch,now=Date.now()}={}){
 const lat=finite(latitude,-90,90),lon=finite(longitude,-180,180),kickoff=Date.parse(kickoffAt||'');
 if(lat===null||lon===null||!Number.isFinite(kickoff)||typeof fetcher!=='function')throw Error('invalid_stadium_forecast_request');
 const opts={headers:{'User-Agent':'MomentumRadar/1.0 (weather-impact research)','Accept':'application/geo+json'},signal:AbortSignal.timeout(7000)};
 const points=await fetcher('https://api.weather.gov/points/'+lat+','+lon,opts);
 if(!points.ok)throw Error('nws_points_unavailable');
 const url=(await points.json())?.properties?.forecastHourly;
 if(typeof url!=='string'||!/^https:\/\/api\.weather\.gov\/gridpoints\/[A-Z0-9]+\/\d+,\d+\/forecast\/hourly(?:\?.*)?$/i.test(url))
  throw Error('untrusted_nws_forecast_url');
 const hourly=await fetcher(url,opts);
 if(!hourly.ok)throw Error('nws_hourly_unavailable');
 const periods=(await hourly.json())?.properties?.periods;
 if(!Array.isArray(periods))throw Error('nws_periods_missing');
 const p=periods.find(x=>{const start=Date.parse(x.startTime||''),end=Date.parse(x.endTime||'');return Number.isFinite(start)&&Number.isFinite(end)&&start<=kickoff&&kickoff<end});
 if(!p)throw Error('nws_kickoff_period_missing');
 const wind=parseWindMph(p.windSpeed);
 const temp=finite(p.temperature,-100,150);
 const rain=finite(p.probabilityOfPrecipitation?.value,0,100);
 if(wind===null||temp===null)throw Error('nws_forecast_fields_missing');
 return {source:'National Weather Service',checkedAt:new Date(now).toISOString(),validAt:p.startTime,
  windMph:wind,gustMph:null,precipProbabilityPct:rain,temperatureF:temp,
  forecastPeriodStart:p.startTime,forecastPeriodEnd:p.endTime,shortForecast:String(p.shortForecast||'').slice(0,160)};
}
