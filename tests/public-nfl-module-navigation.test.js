import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
const names=['games','td','passing','rushing','receiving','receptions','sgps','best','live'];

function fixture(){
 const from=script.indexOf('const rankedModules=new Set(');
 const to=script.indexOf('const views=[',from);
 assert.ok(from>0&&to>from,'navigation functions found');
 const src=script.slice(from,to);
 const elements={
  '#nfl-module-panel':{hidden:false},
  '#nba-module-panel':{hidden:true},
  '#game-day-board':{hidden:false},
  '#rankings-section':{hidden:true},
  '#extra-section':{hidden:true},
  '#nfl-module-message':{hidden:false,textContent:''},
  '#rankings-section h2':{textContent:''}
 };
 const tabs=names.map(name=>({
  dataset:{nflModule:name},attributes:{},classes:new Set(),
  setAttribute(k,v){this.attributes[k]=v},
  classList:{toggle(){}}
 }));
 tabs.forEach(tab=>{
  tab.classList.toggle=(cls,on)=>{
   if(on)tab.classes.add(cls);else tab.classes.delete(cls);
  };
 });
 const calls={ranks:0,best:0,game:0,live:0};
 const state={league:'nfl',module:'games',rank:'td',
  selectedData:null,liveData:null,liveLoading:false};
 const context={
  state,
  labels:{td:'Anytime TD',passing:'Passing yards',rushing:'Rushing yards',
   receiving:'Receiving yards',receptions:'Receptions'},
  $:key=>elements[key],
  document:{querySelectorAll:sel=>sel==='[data-nba-module]'?[]:tabs},
  renderRanks:()=>{calls.ranks++},
  renderExtras:()=>{calls.best++},
  renderGame:()=>{calls.game++},
  loadPublicLive:()=>{calls.live++},
  loadPublicBookResearch:()=>{}
 };
 vm.runInNewContext(src+';this.renderNflModule=renderNflModule;this.activateNflModule=activateNflModule;',context);
 return{elements,tabs,calls,state,nav:context};
}
test('public NFL menu shows nine consumer modules, and no History control',()=>{
 const menu=html.match(/<nav id="nfl-module-tabs"[\s\S]*?<\/nav>/)?.[0]||'';
 assert.deepEqual([...menu.matchAll(/data-nfl-module="([^"]+)"/g)].map(m=>m[1]),names);
 assert.equal(menu.includes('History'),false);
 assert.equal(html.includes('NFL Results History'),false);
 assert.equal(html.includes('/api/public-nfl-history'),false);
 assert.ok(html.includes('id="nfl-module-content"'));
 assert.ok(html.includes('id="game-day-board"'));
 assert.ok(html.includes('moduleContent.appendChild'));
 assert.doesNotThrow(()=>new vm.Script(script));
});
test('Game Day stays visible and category clicks display the correct top-ten board without scrolling past games',()=>{
 const f=fixture();
 f.nav.renderNflModule();
 assert.equal(f.elements['#game-day-board'].hidden,false);
 assert.equal(f.elements['#rankings-section'].hidden,true);
 assert.equal(f.tabs[0].attributes['aria-pressed'],'true');
 const cat=['td','passing','rushing','receiving','receptions'];
 cat.forEach(name=>{
  f.nav.activateNflModule(name);
  assert.equal(f.state.rank,name);
  assert.equal(f.elements['#game-day-board'].hidden,true);
  assert.equal(f.elements['#rankings-section'].hidden,false);
  assert.equal(f.elements['#extra-section'].hidden,true);
  assert.equal(f.tabs.find(t=>t.dataset.nflModule===name).attributes['aria-pressed'],'true');
  assert.match(f.elements['#rankings-section h2'].textContent,/Top 10/);
 });
 assert.equal(f.calls.ranks,5);
 f.nav.activateNflModule('games');
 assert.equal(f.elements['#game-day-board'].hidden,false);
 assert.equal(f.elements['#rankings-section'].hidden,true);
});
test('Same Game Parlays and Live TD Tracker use selected game rather than introducing duplicated cards',()=>{
 const f=fixture();
 f.state.selectedData={status:'CURRENT'};
 f.nav.activateNflModule('sgps');
 assert.equal(f.state.detailTab,'sgps');
 assert.equal(f.elements['#game-day-board'].hidden,false);
 assert.equal(f.calls.game,1);
 assert.match(f.elements['#nfl-module-message'].textContent,/Small, Medium and Nuke/);
 f.state.selected='402222222';
 f.nav.activateNflModule('live');
 assert.equal(f.state.detailTab,'live');
 assert.equal(f.calls.game,2);
 assert.equal(f.calls.live,1);
 assert.match(f.elements['#nfl-module-message'].textContent,/touchdown scoring tracker/);
});
test('Best of Slate opens beneath the menu, NBA hides NFL modules without hiding NBA matchup cards',()=>{
 const f=fixture();
 f.nav.activateNflModule('best');
 assert.equal(f.elements['#extra-section'].hidden,false);
 assert.equal(f.elements['#game-day-board'].hidden,true);
 assert.equal(f.calls.best,1);
 f.state.league='nba';
 f.nav.renderNflModule();
 assert.equal(f.elements['#nfl-module-panel'].hidden,true);
 assert.equal(f.elements['#game-day-board'].hidden,false);
 assert.equal(f.elements['#rankings-section'].hidden,true);
 assert.equal(f.elements['#extra-section'].hidden,true);
});
test('navigation retains sanitized public APIs and inline matchups; no new betting calls',()=>{
 for(const required of [
  "moduleContent.appendChild($('#rankings-section'))",
  "moduleContent.appendChild($('#extra-section'))",
  "state.detailTab=state.module==='sgps'?'sgps':state.module==='live'?'live':'overview'",
  "if(state.detailTab==='live'){$('#match-content').innerHTML=showLive({});loadPublicLive(String(id));}",
  "setInterval(refreshReadOnlyPredictions,30*1000)",
  "/api/public-nfl-game?",
  "/api/public-nfl-live?",
  "/api/public-nfl-rankings?"
 ])assert.ok(html.includes(required),required);
 assert.ok(!html.includes('/api/nfl-markets?'));
 assert.ok(!html.includes('CRON_SECRET'));
 assert.ok(!html.includes('GROQ_API_KEY'));
});
