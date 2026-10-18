import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {trustedGameWeatherSite,fetchPublicKickoffWeather} from '../lib/nfl-public-kickoff-weather.js';

const date='2026-10-18',now=Date.parse('2026-10-16T22:00:00Z');
const atl={gameId:'401872999',kickoff:'2026-10-18T17:00:00Z',
 home:{abbr:'ATL'},away:{abbr:'CHI'},venue:'Mercedes-Benz Stadium'};
test('stadium context is server-owned; indoor and retractable venues are distinguished',()=>{
 const stadium=trustedGameWeatherSite(atl);
 assert.equal(stadium.mode,'COVERED_OR_RETRACTABLE');
 assert.equal(stadium.international,false);
 assert.equal(trustedGameWeatherSite({...atl,home:{abbr:'LV'},venue:'Allegiant Stadium'}).mode,'INDOOR');
 const london=trustedGameWeatherSite({...atl,home:{abbr:'JAX'},venue:'Wembley Stadium'});
 assert.equal(london.international,true);assert.equal(london.location,'London, UK');
});
test('National Weather Service reports actual kickoff wind, rain, and temperature',async()=>{
 let requested=0;
 const fetcher=async(url)=>{
  requested++;
  if(url.startsWith('https://api.weather.gov/points/'))return{
   ok:true,json:async()=>({properties:{forecastHourly:
    'https://api.weather.gov/gridpoints/FFC/1,2/forecast/hourly'}})};
  if(url.includes('gridpoints/FFC/1,2/forecast/hourly'))return{
   ok:true,json:async()=>({properties:{periods:[{startTime:'2026-10-18T16:00:00Z',
    endTime:'2026-10-18T18:00:00Z',temperature:72,
    windSpeed:'12 mph',shortForecast:'Partly Cloudy',
    probabilityOfPrecipitation:{value:30}}]}})};
  throw Error('unexpected_url');
 };
 const report=await fetchPublicKickoffWeather(atl,{fetcher,now});
 assert.equal(requested,2);
 assert.equal(report.status,'FORECAST_AVAILABLE');
 assert.equal(report.source,'National Weather Service');
 assert.equal(report.temperatureF,72);
 assert.equal(report.windMph,12);
 assert.equal(report.rainChancePct,30);
 assert.equal(report.venueMode,'COVERED_OR_RETRACTABLE');
 assert.ok(report.message.includes('No sportsbook line'));
});
test('indoor game does not call a weather API or make betting adjustments',async()=>{
 let called=0;
 const report=await fetchPublicKickoffWeather({...atl,home:{abbr:'LV'},venue:'Allegiant Stadium'},
  {fetcher:()=>{called++;throw Error('unexpected')},now});
 assert.equal(report.status,'INDOOR');assert.equal(called,0);
});
test('Wembley uses an international hourly kickoff forecast and refuses missing samples',async()=>{
 const wembley={...atl,venue:'Wembley Stadium',home:{abbr:'JAX'},away:{abbr:'HOU'},
  kickoff:'2026-10-18T13:30:00Z'};
 let urls=[];
 const report=await fetchPublicKickoffWeather(wembley,{now,fetcher:async(url)=>{
  urls.push(url);return{ok:true,json:async()=>({hourly:{
   time:['2026-10-18T12:00','2026-10-18T13:00'],
   temperature_2m:[51,53],wind_speed_10m:[10,16],
   precipitation_probability:[22,42]}})};}});
 assert.equal(report.status,'FORECAST_AVAILABLE');
 assert.equal(report.temperatureF,53);assert.equal(report.windMph,16);
 assert.equal(report.rainChancePct,42);assert.equal(report.source,'Open-Meteo');
 assert.ok(urls[0].startsWith('https://api.open-meteo.com/v1/forecast?'));
});
test('weather source failures produce an honest weather-not-ready status',async()=>{
 const report=await fetchPublicKickoffWeather(atl,{now,fetcher:async()=>{throw Error('down')}});
 assert.equal(report.status,'FORECAST_NOT_READY');
 assert.ok(!('temperatureF' in report));
});
const ui=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
const script=ui.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
test('public price join shows exact game-scoped DraftKings observation and timestamp',()=>{
 const a=script.indexOf('function publicObservation(name,cat,target){');
 const b=script.indexOf('function renderPlayer(x,cat){',a);
 assert.ok(a>0&&b>a);
 const state={publicBookResearch:{offers:[
  {book:'DraftKings',player:'Parker Washington',category:'td',line:null,
   odds:155,observedAt:'2026-10-16T22:00:00Z',verification:'PUBLIC_PAGE_OBSERVATION_ONLY'},
  {book:'DraftKings',player:'Trevor Lawrence',category:'passing',line:170,
   odds:-110,observedAt:'2026-10-16T22:00:00Z',verification:'PUBLIC_PAGE_OBSERVATION_ONLY'},
  {book:'DraftKings',player:'Trevor Lawrence',category:'passing',line:250,
   odds:145,observedAt:'2026-10-16T22:00:00Z',verification:'PUBLIC_PAGE_OBSERVATION_ONLY'},
  {book:'DraftKings',player:'Parker Washington',category:'receiving',line:30,
   odds:110,observedAt:'2026-10-16T22:00:00Z',verification:'PUBLIC_PAGE_OBSERVATION_ONLY'}
 ]}};
 const esc=x=>String(x??'');
 const fmtStamp=()=> 'Updated Oct 16, 4:00 PM';
 const context={state,esc,fmtStamp,labels:{td:'Anytime TD',passing:'Passing yards'}};
 vm.runInNewContext(script.slice(a,b)+
 ';this.readPrice=publicObservation;this.priceHtml=publicObservationHtml;',context);
 assert.equal(context.readPrice('Parker Washington','td').odds,155);
 assert.equal(context.readPrice('Trevor Lawrence','passing',170).odds,-110);
 assert.equal(context.readPrice('Trevor Lawrence','passing',255),null);
 assert.equal(context.readPrice('Parker Washington','rushing',30),null);
 const html=context.priceHtml('Parker Washington','td');
 assert.ok(html.includes('DraftKings Network +155'));
 assert.ok(html.includes('Observed Oct 16, 4:00 PM'));
 assert.ok(html.includes('Price may change'));
});
test('public Sharp card is brief and uses matched public price rather than an unrelated stale offer',()=>{
 const a=script.indexOf('function showSharp(d){'),b=script.indexOf('function renderNflLiveSlate(){',a);
 assert.ok(a>0&&b>a);
 const context={esc:x=>String(x??''),labels:{td:'Anytime TD'},
  publicObservation:()=>({book:'DraftKings',odds:155}),
  publicObservationHtml:()=>'<span>DraftKings Network +155 · Observed Oct 16</span>',
  noData:()=>''};
 vm.runInNewContext(script.slice(a,b)+';this.render=showSharp;',context);
 const html=context.render({status:'LAST_SAVED',sharpReview:{candidates:[{
  name:'Parker Washington',category:'td',team:'JAX',quantitativeAngle:{
   estimatedHitChancePct:44,hitTarget:'Anytime TD'}}]}});
 for(const expected of ['Parker Washington','44%','DraftKings Network +155','Observed Oct 16'])
  assert.ok(html.includes(expected),expected);
 assert.ok(!html.includes('Bankroll Strategy:'));
 assert.ok(!html.includes('Market Movement:'));
 assert.ok(html.includes('<details'));
 assert.ok(!html.includes('Betting odds not confirmed'));
 assert.doesNotThrow(()=>new vm.Script(script));
});
test('public game weather and observed odds automatically refresh without sportsbook/AI writes',()=>{
 const route=readFileSync(new URL('../api/public-nfl-weather.js',import.meta.url),'utf8');
 assert.ok(route.includes('fetchPublicKickoffWeather(game)'));
 assert.ok(route.includes('/api/nfl-schedule?date='));
 assert.ok(!route.includes('CRON_SECRET'));
 assert.ok(!route.includes('GROQ_API_KEY'));
 assert.ok(ui.includes('/api/public-nfl-weather?'));
 assert.ok(ui.includes('/api/nfl-public-book-research?'));
 assert.ok(ui.includes('loadPublicWeather(date,id)'));
 assert.ok(ui.includes('loadPublicBookResearch(date,id)'));
 assert.ok(!ui.includes('Kickoff forecasts and historical player-weather comparisons will be shown after source verification'));
});
