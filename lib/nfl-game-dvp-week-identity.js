// Pure, fail-closed discovery of the CURRENT ESPN matchup's NFL week.
// Betting-provider events may not contain a week; never default to Week 1
// and mistake old DVP totals for current opponent defense.
export function nflScheduledGameDvpIdentity(schedule,{gameId,date}={}){
 if(schedule?.ok!==true||!/^\d{7,12}$/.test(String(gameId||''))||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return null;
 const game=(Array.isArray(schedule.games)?schedule.games:[])
  .find(g=>String(g?.gameId||'')===String(gameId));
 if(!game)return null;
 const week=Number(game.week),season=Number(game.season),
  kickoff=Date.parse(String(game.kickoff||''));
 const day=String(date);
 // ESPN season weeks 1..18 only, no preseason week/substitution,
 // and actual game must be within one day of the game-selected UTC date
 // to account for evening kickoffs crossing a local calendar boundary.
 const check=Date.parse(day+'T12:00:00Z');
 if(!Number.isInteger(week)||week<1||week>18||
    !Number.isInteger(season)||season<2020||season>2100||
    !Number.isFinite(kickoff)||!Number.isFinite(check)||
    Math.abs(kickoff-check)>36*3600_000)
  return null;
 return{week,season,gameId:String(gameId)};
}
