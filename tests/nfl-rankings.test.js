import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const server=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
function take(s,start,end){
  const a=s.indexOf(start),b=s.indexOf(end,a);
  assert.ok(a>=0&&b>a,'Expected code section '+start);
  return s.slice(a,b);
}
const render=new Function('x','cat','nflLabels','nflEscape',
  take(html,'function nflThreshold(','async function loadNFLRanks(')+';return nflRankCard(x,cat);');
const labels={td:'Anytime TDs',passing:'Passing Yards',rushing:'Rushing Yards',receiving:'Receiving Yards',receptions:'Receptions'};
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const show=(x,cat='rushing')=>render(x,cat,labels,escape);

test('model-only rushing ranking does not invent sportsbook verification or win probability',()=>{
  const out=show({rank:1,name:'Example Runner',team:'ATL',opponent:'NO',projection:124,confidence:80,momentumScore:58,perGame:123.5,gamesPlayed:4,reason:'Current projection'});
  assert.match(out,/Projected: 124 rushing yards/);
  assert.match(out,/Model-only .* line not verified/);
  assert.match(out,/Momentum rating \(not hit probability\)/);
  assert.match(out,/58\/100/);
  assert.match(out,/4 completed games/);
  assert.doesNotMatch(out,/80%|Sportsbook .* Model projection|Momentum confidence/);
});
test('only a supplied DraftKings or FanDuel offer displays a book line and odds',()=>{
  const out=show({rank:2,name:'Example Runner',projection:95,perGame:90,gamesPlayed:6,momentumScore:62,bestBook:{book:'DraftKings',line:88.5,odds:-110}});
  assert.match(out,/DraftKings .* Rushing yards: 88\.5/);
  assert.match(out,/Projection minus line \+7/);
  assert.match(out,/DraftKings: -110/);
  assert.doesNotMatch(out,/line not verified/);
});
test('unpriced or incomplete offer does not appear verified',()=>{
  const out=show({rank:3,name:'Example Runner',projection:70,gamesPlayed:4,momentumScore:55,bestBook:{book:'FanDuel',odds:-110}});
  assert.match(out,/Model-only .* line not verified/);
  assert.doesNotMatch(out,/FanDuel: -110/);
});
test('weighted projection incorporates opponent DVP only when ranked evidence exists',()=>{
  const project=new Function('categories','ctx','norm',
    take(server,'function analyticsMetric(','function analyticsLine(')+';return populatePredictiveLines(categories,ctx);');
  const norm=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const data=()=>({passing:[],rushing:[{name:'Example Runner',position:'RB',team:'ATL',opponent:'NO',gamesPlayed:4,perGame:85,projection:85,recentForm:{last5:[80,88,95],trend:6}}],receiving:[],receptions:[]});
  const noDvp=project(data(),{opponents:{ATL:'NO'},dvp:null},norm).rushing[0];
  const withDvp=project(data(),{opponents:{ATL:'NO'},dvp:{defenseRanks:{RB:{NO:{rushYards:{rankMost:1}}}},offenseRanks:{RB:{ATL:{rushYards:{rankMost:10}}}}}},norm).rushing[0];
  assert.ok(withDvp.projection>noDvp.projection);
  assert.equal(withDvp.matchupRankMost,1);
  assert.equal(noDvp.matchupRankMost,null);
  assert.match(withDvp.reason,/4 completed games/);
  assert.match(noDvp.reason,/no matchup-rank adjustment applied/);
});
