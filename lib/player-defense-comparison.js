// Descriptive comparison, not a betting probability or an offered sportsbook line.
export function comparePlayerToDefense(player,defense,stat){
 const playerAverage=player?.averages?.[stat];
 const defenseAllowed=defense?.allowedPerGame?.[stat];
 if(!Number.isFinite(playerAverage)||!Number.isFinite(defenseAllowed))
  return {ok:false,reason:'INSUFFICIENT_MATCHUP_DATA'};
 const delta=Math.round((defenseAllowed-playerAverage)*100)/100;
 return {ok:true,stat,playerAverage,defenseAllowed,delta,
  direction:delta>0?'opponent_allows_more':delta<0?'opponent_allows_less':'equal',
  playerGames:player.games,defenseGames:defense.games,
  note:'Descriptive matchup comparison only; not a projected player stat or win probability'};
}
