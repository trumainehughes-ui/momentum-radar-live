// Public-only compact offense-vs-defense matchup display.
// All rows come from saved, game-specific per-game stats. A differential in
// historical samples is NOT a player projection, predicted advantage, or bet.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const count=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?
 Number(v):null;
const format=n=>Math.round(n).toLocaleString('en-US',{maximumFractionDigits:0});
const metricLabel={
 passYards:'Passing yards',rushYards:'Rushing yards',
 recYards:'Receiving yards',receptions:'Receptions',
 passTD:'Passing TDs',rushTD:'Rushing TDs',recTD:'Receiving TDs',
 targets:'Targets'
};
const primary={QB:'passYards',RB:'rushYards',WR:'recYards',TE:'recYards'};
const teams={QB:'quarterbacks',RB:'running backs',WR:'wide receivers',TE:'tight ends'};
function rowsForSide(side){
 const positions=Array.isArray(side?.positions)?side.positions:[];
 const rows=[];
 for(const position of ['QB','RB','WR','TE']){
  const found=positions.find(p=>String(p.position||'').toUpperCase()===position);
  if(!found)continue;
  const stats=Array.isArray(found.metrics)?found.metrics:[];
  const main=stats.find(m=>m.metric===primary[position]&&
    (count(m.offensePerGame)!==null||count(m.defenseAllowedPerGame)!==null));
  if(!main)continue;
  rows.push({position,metric:main.metric,label:metricLabel[main.metric],
   produced:count(main.offensePerGame),allowed:count(main.defenseAllowedPerGame),
   // Preserve secondary stats in a collapsed, opt-in panel.
   extras:stats.filter(m=>m!==main&&
     (count(m.offensePerGame)!==null||count(m.defenseAllowedPerGame)!==null)).map(m=>({
     label:metricLabel[m.metric]||String(m.metric||'Statistic'),
     produced:count(m.offensePerGame),allowed:count(m.defenseAllowedPerGame)
   }))});
 }
 return rows;
}
function conciseTrend(side,rows){
 // Highlight the strongest *observed gap* without claiming which team wins
 // or that it predicts future scoring. Never compare different stat types.
 const comparable=rows.filter(r=>r.produced!==null&&r.allowed!==null);
 if(!comparable.length)return 'Not enough comparable offense and defense samples for a matchup takeaway.';
 const best=[...comparable].sort((a,b)=>
  Math.abs(b.produced-b.allowed)-Math.abs(a.produced-a.allowed))[0];
 const difference=Math.abs(best.produced-best.allowed);
 const action=best.produced>=best.allowed?
  'produced more than the opposing defense has typically allowed':
  'produced less than the opposing defense has typically allowed';
 return side.offense+' '+teams[best.position]+
  ' '+action+' in '+best.label.toLowerCase()+
  ' ('+format(best.produced)+' vs '+format(best.allowed)+' yards/game'+
  (best.metric==='receptions'?'':'')+').';
}
const categoryFor=metric=>({passYards:'passing',rushYards:'rushing',recYards:'receiving',receptions:'receptions'}[metric]||null);
// Customers can compare every verified primary-role player, not only the
// single strongest group mismatch. Defensive allowances describe an entire
// position group; they are never an individual player's implied prop line.
function exploitFor(side,rows,categories){
 const sections=[];
 const visibleLimits={QB:1,RB:2,WR:2,TE:1};
 for(const row of rows){
  const category=categoryFor(row.metric);
  if(!category)continue;
  const players=(Array.isArray(categories?.[category])?categories[category]:[])
   .filter(p=>String(p.team||'').toUpperCase()===String(side.offense||'').toUpperCase()&&
    String(p.position||'').toUpperCase()===row.position&&p.name&&
    p.starterVerified===true&&Number(p.gameSample)>=2&&Number(p.avgPerGame)>0&&
    !/\b(?:OUT|INACTIVE|DOUBTFUL|SUSPENDED|IR)\b/i.test(String(p.starterStatus||'')))
   .sort((a,b)=>(Number(b.avgPerGame)||0)-(Number(a.avgPerGame)||0));
  if(!players.length)continue;
  const hasComparison=row.produced!==null&&row.allowed!==null&&
   row.produced>0&&Number(side.offenseGames)>=2&&Number(side.defenseGames)>=2;
  const ratio=hasComparison?(row.allowed-row.produced)/row.produced:null;
  const trend=!hasComparison?'Insufficient group sample':
   ratio>=0.10?'Favorable position-group trend':
   ratio<=-0.10?'Tougher position-group trend':'Similar position-group production';
  const unit=row.metric==='receptions'?'receptions':'yards';
  const avg=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:1});
  const playerCard=p=>{
   const projection=Number(p.projection),ceiling=Number(p.range?.ceiling);
   const model=Number.isFinite(projection)&&projection>0?
    '<p>Model projection: <b>'+esc(row.metric==='receptions'?avg(projection):Math.round(projection))+' '+esc(unit)+'</b>'+
     (Number.isFinite(ceiling)&&ceiling>0?
      ' · Historical variability ceiling: <b>'+esc(row.metric==='receptions'?Math.ceil(ceiling):Math.ceil(ceiling/5)*5)+' '+esc(unit)+'</b>':'')+
    '</p>':'';
   return '<div class="mr-matchup-player"><p><strong>Player to watch: '+esc(p.name)+'</strong> · '+esc(side.offense)+'</p>'+
    '<p>'+esc(p.name)+' averages <b>'+esc(avg(p.avgPerGame))+' '+esc(unit)+'/game</b> over '+esc(p.gameSample)+' games. '+
     (row.allowed!==null?esc(side.defense)+' allows <b>'+esc(avg(row.allowed))+' '+esc(unit)+'/game</b> to '+esc(teams[row.position])+' combined.':'Opponent position-group allowance is not sufficiently established.')+'</p>'+
    model+'</div>';
  };
  const limit=visibleLimits[row.position]||2;
  const more=players.length>limit?
   '<details class="mr-matchup-extra"><summary>More verified '+esc(teams[row.position])+' ('+(players.length-limit)+')</summary>'+
    players.slice(limit).map(playerCard).join('')+'</details>':'';
  const why=hasComparison?
   esc(side.offense)+' '+esc(teams[row.position])+' produce '+esc(avg(row.produced))+
   ' '+esc(unit)+'/game as a group; '+esc(side.defense)+' allows '+esc(avg(row.allowed))+
   ' '+esc(unit)+'/game to the same position group.':
   'There are not yet two comparable offense and defense games for a supported position-group trend.';
  sections.push('<section class="mr-matchup-role"><h5>'+esc(row.position)+' · '+esc(row.label)+
   ' · '+esc(trend)+'</h5>'+players.slice(0,limit).map(playerCard).join('')+
   more+'<p class="mr-matchup-role-why"><b>Why this matchup:</b> '+why+
   ' This is historical matchup context, not a sportsbook selection or a guaranteed individual advantage.</p></section>');
 }
 if(!sections.length)
  return '<p class="mr-matchup-meta">No eligible, sufficiently sampled primary-role player has verified starter evidence for this matchup.</p>';
 return '<div class="mr-matchup-exploits"><p class="mr-matchup-meta"><b>Verified starter readouts</b> · Passing, rushing and receiving</p>'+
  sections.join('')+'</div>';
}
export function renderPublicMatchupIntelligence(sides,categories){
 if(!Array.isArray(sides)||!sides.length)
  return '<p class="sub">Offense-versus-defense matchup statistics are being updated.</p>';
 const styles='<style>'+
 '.mr-matchup-pairs{display:grid;gap:13px;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));margin:14px 0 18px}'+
 '.mr-matchup-card{min-width:0;border:1px solid #365b6a;border-radius:14px;background:#0a2230;padding:15px}'+
 '.mr-matchup-card h4{font-size:17px;line-height:1.3;color:#e4fff1;margin:0 0 6px}'+
 '.mr-matchup-meta{color:#9ebdc9;font-size:12px;line-height:1.5;margin:0 0 13px}'+
 '.mr-matchup-table{display:grid;gap:0}'+
 '.mr-matchup-row{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(56px,.65fr) minmax(56px,.65fr);align-items:center;gap:7px;padding:10px 0;border-top:1px solid #234857}'+
 '.mr-matchup-row:first-child{border-top:0}'+
 '.mr-matchup-row strong{font-size:13px;color:#e3f2f7;line-height:1.35}'+
 '.mr-matchup-row .mr-matchup-value{text-align:right;color:#f0f9fe;font-weight:800;font-size:15px;font-variant-numeric:tabular-nums}'+
 '.mr-matchup-row .mr-matchup-empty{text-align:right;color:#90a8b4;font-size:13px}'+
 '.mr-matchup-columns{color:#a0c2ce;text-align:right;font-size:11px;font-weight:750;line-height:1.35}'+
 '.mr-matchup-columns:first-child{text-align:left}'+
 '.mr-matchup-position{display:inline-flex;font-size:11px;padding:3px 5px;border:1px solid #416877;background:#123947;color:#a9ecda;border-radius:6px;margin-right:6px}'+
 '.mr-matchup-takeaway{margin:12px 0 3px;color:#c5dbe3;font-size:12px;line-height:1.55;border-left:3px solid #46bd9a;padding-left:10px}'+
 '.mr-matchup-extra{margin-top:10px;padding-top:9px;border-top:1px solid #234857;color:#b1d8d6}'+
 '.mr-matchup-extra summary{font-size:12px;font-weight:750;cursor:pointer;padding:4px 0}'+
 '.mr-matchup-extra p{font-size:12px;line-height:1.5;margin:9px 0 0;color:#a9c4ce}'+
 '.mr-matchup-exploits{margin:14px 0;border-top:1px solid #2d6471;padding-top:12px}.mr-matchup-role{margin:10px 0;padding:10px;border:1px solid #3d806f;border-radius:10px;background:#102c32;color:#d8f4ed;font-size:12px;line-height:1.55}.mr-matchup-role h5{font-size:12px;margin:0 0 8px;color:#b3f1dc}.mr-matchup-player{padding:8px 0;border-top:1px solid #274e54}.mr-matchup-player p{margin:5px 0}.mr-matchup-role-why{font-size:11px;color:#b3cbd1;line-height:1.5;margin:9px 0 0}'+
 '.mr-matchup-bottom-note{color:#96b4c1;font-size:11px;line-height:1.45;margin:2px 0 18px}'+
 '@media(max-width:440px){.mr-matchup-card{padding:12px}.mr-matchup-row{gap:4px;grid-template-columns:minmax(0,1fr) 62px 62px}.mr-matchup-row strong{font-size:12px}.mr-matchup-row .mr-matchup-value{font-size:14px}}'+
 '</style>';
 const cards=sides.filter(s=>s&&s.offense&&s.defense).map(side=>{
  const rows=rowsForSide(side);
  const offenceCount=count(side.offenseGames),defenceCount=count(side.defenseGames);
  const offense=String(side.offense),defense=String(side.defense);
  const data=rows.length?
   '<div class="mr-matchup-table">'+
   '<div class="mr-matchup-row"><span class="mr-matchup-columns">Position / stat</span>'+
   '<span class="mr-matchup-columns">Offense avg</span><span class="mr-matchup-columns">Defense allows</span></div>'+
   rows.map(r=>'<div class="mr-matchup-row"><strong><span class="mr-matchup-position">'+
    esc(r.position)+'</span>'+esc(r.label)+'</strong>'+
    (r.produced!==null?'<span class="mr-matchup-value">'+format(r.produced)+'</span>':
     '<span class="mr-matchup-empty">—</span>')+
    (r.allowed!==null?'<span class="mr-matchup-value">'+format(r.allowed)+'</span>':
     '<span class="mr-matchup-empty">—</span>')+'</div>').join('')+
   '</div>':'<p class="mr-matchup-meta">This matchup is waiting for position statistics.</p>';
  const extras=rows.flatMap(r=>r.extras.map(x=>({position:r.position,...x})));
  return '<section class="mr-matchup-card"><h4>'+esc(offense)+' offense <span aria-hidden="true">→</span> '+esc(defense)+' defense</h4>'+
   '<p class="mr-matchup-meta">Per game · Offense '+(offenceCount??'—')+
    ' games · Defense '+(defenceCount??'—')+' games</p>'+data+
   (rows.length?'<p class="mr-matchup-takeaway"><b>Key comparison:</b> '+esc(conciseTrend(side,rows))+'</p>':'')+
   (categories?exploitFor(side,rows,categories):'')+
   (extras.length?'<details class="mr-matchup-extra"><summary>More matchup stats</summary>'+
    extras.map(x=>'<p><b>'+esc(x.position)+' '+esc(x.label)+'</b> · '+
     (x.produced===null?'—':format(x.produced))+' offense avg / '+
     (x.allowed===null?'—':format(x.allowed))+' defense allows</p>').join('')+
   '</details>':'')+'</section>';
 }).join('');
 return styles+'<div class="mr-matchup-pairs" aria-label="Two-way offense and defense position matchups">'+cards+'</div>'+
  '<p class="mr-matchup-bottom-note">Numbers are historical team-position totals per game, not individual player forecasts. “Defense allows” means yards or receptions conceded to that position group. Different samples may not predict the next game.</p>';
}
