import test from 'node:test';
import assert from 'node:assert/strict';
import {renderNflWeatherImpactPanel} from '../lib/nfl-weather-panel.js';
const assessment={status:'FORECAST_REVIEWED',severity:'high',message:'Strong wind may affect passing'};
const explanation={insights:['Passing accuracy can be affected','Kicking requires review']};
test('Weather Impact panel renders advisory weather and historical player samples',()=>{
 const html=renderNflWeatherImpactPanel({assessment,explanation,players:[{playerName:'Sample QB',label:'Passing yards',historicalComparison:{condition:'windy',games:8,average:235},displayMessage:'Descriptive only'}]});
 assert.match(html,/Weather Impact/);assert.match(html,/Sample QB/);assert.match(html,/8 games/);assert.match(html,/No player prop, sportsbook odds, or SGP is verified/);
});
test('Weather Impact panel escapes external player and forecast strings',()=>{
 const html=renderNflWeatherImpactPanel({assessment:{...assessment,message:'<script>alert(1)</script>'},explanation:{insights:['<img src=x onerror=alert(1)>']},players:[{playerName:'<svg onload=alert(1)>',displayMessage:'<script>x</script>'}]});
 assert.doesNotMatch(html,/<script>|<img|<svg/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;svg/);
});
test('Weather Impact panel rejects invalid data shape',()=>assert.throws(()=>renderNflWeatherImpactPanel({assessment,explanation,players:{}}),/invalid_weather_panel/));
