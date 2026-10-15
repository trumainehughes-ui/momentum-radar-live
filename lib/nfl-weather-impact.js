// Weather impact advisory for outdoor NFL games. Forecasts are observations, not sportsbook quotes.
// Never fabricate player props or apply blanket positive rushing adjustments.
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
export function evaluateNflWeather({gameId,venue,forecast,now=Date.now()}={}){
 const roof=String(venue?.roofStatus||'unknown').toLowerCase();
 const indoor=roof==='closed'||roof==='dome'||roof==='indoor';
 const id=String(gameId||'');
 if(!/^\d{7,12}$/.test(id))throw Error('invalid_game_id');
 if(indoor)return {gameId:id,status:'INDOOR',severity:'none',message:'Indoor or closed-roof conditions: no outdoor weather adjustment.',weatherSgpEligible:false,canPublish:false};
 if(roof!=='open'&&roof!=='outdoor')return {gameId:id,status:'ROOF_UNCONFIRMED',severity:'unknown',message:'Roof status is not confirmed. Weather impact cannot be assessed.',weatherSgpEligible:false,canPublish:false};
 const kickoff=Date.parse(venue?.kickoffAt||'');
 const checked=Date.parse(forecast?.checkedAt||'');
 const valid=Date.parse(forecast?.validAt||'');
 const wind=finite(forecast?.windMph),gust=finite(forecast?.gustMph),rain=finite(forecast?.precipProbabilityPct),temp=finite(forecast?.temperatureF);
 if(!forecast?.source||!Number.isFinite(checked)||checked>now||now-checked>3*60*60*1000||
 !Number.isFinite(kickoff)||!Number.isFinite(valid)||Math.abs(valid-kickoff)>3*60*60*1000||
 wind===null||wind<0||wind>200||gust!==null&&(gust<0||gust>200)||
 rain!==null&&(rain<0||rain>100)||temp!==null&&(temp< -100||temp>150))
  return {gameId:id,status:'FORECAST_UNVERIFIED',severity:'unknown',message:'A recent, kickoff-aligned stadium forecast is unavailable. No weather-adjusted picks.',weatherSgpEligible:false,canPublish:false};
 const severity=wind>=20||gust!==null&&gust>=30?'high':wind>=15||gust!==null&&gust>=25?'elevated':wind>=10?'watch':'low';
 const note=severity==='high'?'Strong wind may materially disrupt passing and kicking.':
 severity==='elevated'?'Wind may reduce passing efficiency and affect longer kicks.':
 severity==='watch'?'Moderate wind warrants checking passing and kicking projections.':
 'No significant wind-driven adjustment is indicated.';
 return {gameId:id,status:'FORECAST_REVIEWED',severity,weather:{windMph:wind,gustMph:gust,precipProbabilityPct:rain,temperatureF:temp,source:String(forecast.source),checkedAt:forecast.checkedAt,validAt:forecast.validAt},
 message:note+' Weather alone does not establish value for rushing or other props.',
 weatherSgpEligible:severity==='elevated'||severity==='high',canPublish:false,
 requiredBeforeSgp:['confirmed active starters','fresh injury reports','verified DraftKings/FanDuel lines and odds','offense-versus-defense model','book-specific SGP tier validation']};
}
