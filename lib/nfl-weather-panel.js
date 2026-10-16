// Safe, server-rendered markup for the Weather Impact panel.
// Render text only; never expose manual-review credentials or unverified sportsbook picks.
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderNflWeatherImpactPanel({assessment,explanation,players=[]}={}){
 if(!assessment||!explanation||!Array.isArray(players))throw Error('invalid_weather_panel');
 const status=escapeHtml(assessment.status||'FORECAST_UNVERIFIED');
 const severity=escapeHtml(assessment.severity||'unknown');
 const headline=escapeHtml(assessment.message||'Kickoff weather not verified');
 const insights=Array.isArray(explanation.insights)?explanation.insights:[];
 const items=insights.map(x=>'<li>'+escapeHtml(x)+'</li>').join('');
 const playerCards=players.slice(0,20).map(p=>{
  const name=escapeHtml(p.playerName||'Player');
  const label=escapeHtml(p.label||p.stat||'Player stat');
  const sample=p.historicalComparison;
  const comparison=sample?escapeHtml(sample.condition)+' weather: '+escapeHtml(sample.games)+' games, historical average '+escapeHtml(sample.average??'unavailable'):'No comparable verified weather history';
  return '<article class="weather-player"><h4>'+name+' — '+label+'</h4><p>'+comparison+'</p><p>'+escapeHtml(p.displayMessage||'Advisory only')+'</p></article>';
 }).join('');
 return '<section class="weather-impact" aria-label="NFL Weather Impact"><h3>Weather Impact</h3><p><strong>'+status+'</strong> · '+severity+'</p><p>'+headline+'</p><ul>'+items+'</ul><div class="weather-player-list">'+playerCards+'</div><p class="weather-disclaimer">Research only. No player prop, sportsbook odds, or SGP is verified or published by this weather report.</p></section>';
}
