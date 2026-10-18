import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const page=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
const script=page.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
const start=script.indexOf('function renderNflLiveSlate(){');
const end=script.indexOf('// NBA uses the same single expandable matchup surface',start);
assert.ok(start>0&&end>start,'all-slate public TD renderer must exist');
const code=script.slice(start,end);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(slate){
 const node={innerHTML:''},state={league:'nfl',module:'live',date:'2026-10-18',
  liveSlateData:slate,liveSlateLoading:false,liveSlateError:null};
 vm.runInNewContext(code+';renderNflLiveSlate();',{
  state,esc,fmtTime:()=> 'Sun 1 PM',fmtStamp:()=> 'Updated 11:31 AM',
  noData:(x,y)=>x+' — '+y,$:q=>q==='#live-slate-content'?node:null});
 return node.innerHTML;
}
const report={
 date:'2026-10-18',fetchedAt:'2026-10-18T17:30:00Z',
 totals:{games:3,touchdowns:3,unavailable:0},
 games:[
  {gameId:'401872996',status:'FINAL',statusDetail:'Final',
   away:{name:'Houston Texans',abbr:'HOU',score:14},
   home:{name:'Jacksonville Jaguars',abbr:'JAX',score:21},
   touchdowns:[{name:'Player One',star:true,period:1,clock:'5:13',
    description:'Six-yard passing touchdown'},
    {name:'Player One',star:false,period:3,clock:'9:21',
     description:'Second touchdown'}]},
  {gameId:'401872999',status:'LIVE',statusDetail:'Q2 06:12',
   away:{name:'Chicago Bears',abbr:'CHI',score:7},
   home:{name:'Atlanta Falcons',abbr:'ATL',score:0},
   touchdowns:[{name:'Player Two',star:false,period:2,clock:'6:12',
    description:'Rushing touchdown'}]},
  {gameId:'401873003',status:'SCHEDULED',statusDetail:'4:05 PM ET',
   away:{name:'Tennessee Titans',abbr:'TEN',score:null},
   home:{name:'Indianapolis Colts',abbr:'IND',score:null},
   touchdowns:[]}
 ]
};
test('main Live TD button opens league-wide day view without matchup selection',()=>{
 assert.match(page,/data-nfl-module="live"/);
 assert.match(page,/id="nfl-live-slate"/);
 assert.match(page,/id="live-slate-content"/);
 assert.match(page,/module==='live'\?\s*'Showing touchdowns from ALL NFL games/);
 assert.match(page,/const gameModules=new Set\(\['games','sgps'\]\)/);
 assert.doesNotMatch(script,/Select a matchup below to see its touchdown scoring tracker/);
 assert.doesNotMatch(script,/loadPublicLive\(state\.selected\)/);
});
test('all games display scorer, score, period, star, and repeat touchdowns as individual plays',()=>{
 const out=render(report);
 for(const value of ['Player One','Player Two','Houston Texans','Chicago Bears',
  'Jacksonville Jaguars','Atlanta Falcons','Tennessee Titans','Indianapolis Colts',
  'HOU 14','JAX 21','CHI 7','ATL 0','Quarter 1','5:13','Q2 06:12',
  '3</div>','⭐ Player One','Game has not started'])
  assert.ok(out.includes(value),value);
 assert.equal((out.match(/data-live-game=/g)||[]).length,3);
 assert.equal((out.match(/Second touchdown/g)||[]).length,1);
 assert.equal((out.match(/class="live-slate-play"/g)||[]).length,3);
 assert.doesNotMatch(out,/⭐ Player Two/);
});
test('unavailable scoring feed warns of missing games rather than declaring zero touchdowns',()=>{
 const altered={...report,totals:{...report.totals,unavailable:1},
  games:[...report.games.slice(0,2),{...report.games[2],
   status:'LIVE',sourceStatus:'SCORING_FEED_UNAVAILABLE'}]};
 const out=render(altered);
 assert.match(out,/1 game could not be verified/);
 assert.match(out,/Scoring data unavailable/);
 assert.match(out,/not the full-day final count/);
});
test('external scorer text and team names are escaped before display',()=>{
 const altered={...report,games:[{...report.games[0],
  home:{...report.games[0].home,name:'<svg onload=alert(1)>'},
  touchdowns:[{...report.games[0].touchdowns[0],
   name:'<img src=x onerror=alert(1)>',description:'<script>fake</script>'}]}]};
 const out=render(altered);
 assert.match(out,/&lt;img/);
 assert.match(out,/&lt;svg/);
 assert.match(out,/&lt;script&gt;/);
 assert.doesNotMatch(out,/<img src=x|<svg onload|<script>fake/);
});
test('public slate refresh uses same exact date and one read-only source, never paid sportsbook or AI collector',()=>{
 assert.match(page,/getJson\('\/api\/public-nfl-live-slate\?'/);
 assert.match(page,/new URLSearchParams\(\{date\}\)/);
 assert.match(page,/if\(state\.league==='nfl'&&state\.module==='live'\)/);
 assert.match(page,/if\(state\.module==='live'\)loadPublicLiveSlate\(\)/);
 assert.match(page,/setInterval\(refreshReadOnlyPredictions,30\*1000\)/);
 assert.match(page,/state\.liveSlateData\?\.date===state\.date/);
 assert.doesNotMatch(code,/api\/nfl-markets|CRON_SECRET|api\/public-nfl-ai|new WebSocket/);
 assert.ok(page.includes('id="refresh-live-slate"'));
 assert.doesNotMatch(page,/data-refresh-live="1"/);
});
test('public game breakdown no longer offers a separate single-game Live TD detail tab',()=>{
 const views=script.slice(script.indexOf('const views='),script.indexOf('const rankMetricNames=',script.indexOf('const views=')));
 assert.doesNotMatch(views,/\['live','📊 Live TD Tracker'\]/);
 assert.match(script,/For touchdown scorers from ALL games, open the top-level Live TD Tracker/);
});
test('live-slate game cards remain responsive on mobile',()=>{
 assert.match(page,/\.live-slate-cards\{display:grid/);
 assert.match(page,/@media\(max-width:570px\)\{\.live-slate-cards\{grid-template-columns:1fr/);
});
