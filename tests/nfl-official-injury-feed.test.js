import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNflWeeklyInjuryHtml,nflOfficialWeeklyFromLeague,nflCanonTeam} from '../lib/nfl-official-injury-feed.js';
const table=(name,rows)=>'<div class="nfl-t-stats__title"><div class="d3-o-section-sub-title"><span>'+name+'</span></div></div><div class="d3-o-table--horizontal-scroll"><table class="d3-o-table"><thead><tr><th>Player</th><th>Position</th><th>Injuries</th><th>Practice Status</th><th>Game Status</th></tr></thead><tbody>'+rows.map(x=>'<tr><td scope="row"><a href="/players/test">'+x.join('')+'</a></td><td>RB</td><td>Hamstring</td><td>Did Not Participate In Practice</td><td>Out</td></tr>').join('')+'</tbody></table></div>';
const row=name=>[name];
const html='<html><body>'+table('Eagles',[row('Saquon Barkley')])+table('Jaguars',[row('Jaylon Jones')])+table('Vikings',[row('A Running Back')])+'</body></html>';
test('parses team-scoped 5-column NFL reports and normalizes to ESPN abbreviations',()=>{
 const p=parseNflWeeklyInjuryHtml(html,{year:2026,week:5});
 assert.equal(p.teamCount,3);
 assert.equal(p.teams.get('PHI').players[0].name,'Saquon Barkley');
 assert.equal(p.teams.get('JAX').players[0].status,'OUT');
 assert.equal(nflCanonTeam('JAC'),'JAX');
 assert.equal(nflCanonTeam('WSH'),'WAS');
});
test('official site practice-only players do not get designated OUT from did-not-practice',()=>{
 const fixture='<html><body>'+table('Eagles',[row('Saquon Barkley')])+table('Jaguars',[row('Jaylon Jones')])+'</body></html>';
 assert.equal(parseNflWeeklyInjuryHtml(fixture).teams.get('PHI').players.length,1);
});
test('a week page is checked exactly once and scoped to selected matchup',async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;return{ok:true,text:async()=>html}};
 const r=await nflOfficialWeeklyFromLeague({year:2026,week:5,teams:['PHI','JAX'],fetcher});
 assert.equal(r.available,true);
 assert.equal(r.entries.length,2);
 const s=await nflOfficialWeeklyFromLeague({year:2026,week:5,teams:['PHI','MIN'],fetcher});
 assert.equal(s.available,true);assert.equal(s.entries.length,2);assert.equal(calls,1);
 const wrong=await nflOfficialWeeklyFromLeague({year:2026,week:5,teams:['PHI','NYJ'],fetcher});
 assert.equal(wrong.available,false);
});
