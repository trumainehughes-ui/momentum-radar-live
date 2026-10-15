// Pure, source-aware NFL weather impact explanation. Advisory only, never sportsbook pricing.
export function explainNflWeatherImpact(assessment){
 if(!assessment||assessment.status!=='FORECAST_REVIEWED')
  return {status:'WEATHER_UNVERIFIED',playerAdjustmentsAllowed:false,insights:[],message:assessment?.message||'No verified stadium forecast.'};
 const w=assessment.weather||{};
 const insights=[];
 if(assessment.severity==='high'||assessment.severity==='elevated'){
  insights.push({market:'passing_yards',direction:'potential_downside',reason:'Wind may impair passing efficiency, especially deep attempts; verify quarterback tendencies and defensive coverage.'});
  insights.push({market:'receiving_yards',direction:'mixed',reason:'Downfield targets may be less efficient; short-area targets can shift, so player-specific projections must be recalculated.'});
  insights.push({market:'rushing_yards',direction:'uncertain',reason:'A possible shift toward rushing does not guarantee any running back exceeds a sportsbook line.'});
  insights.push({market:'kicking',direction:'potential_downside',reason:'Wind and gusts may reduce long-range field-goal reliability; consider stadium orientation and kick distance.'});
 }
 if(w.precipProbabilityPct!==null&&w.precipProbabilityPct>=60)
  insights.push({market:'ball_security',direction:'monitor',reason:'High precipitation probability is not proof of wet field conditions; confirm precipitation type, intensity, and field status.'});
 if(w.temperatureF!==null&&w.temperatureF<=20)
  insights.push({market:'cold_weather',direction:'monitor',reason:'Extreme cold can affect grip and ball handling; player-specific performance effects require validated historical evidence.'});
 return {status:'ADVISORY_ONLY',severity:assessment.severity,weatherSgpEligible:assessment.weatherSgpEligible,
  playerAdjustmentsAllowed:false,canPublish:false,insights,
  message:insights.length?'Weather conditions warrant player-specific model review, not automatic line changes.':'No material weather-specific model adjustment is indicated.'};
}
