// Construct game metadata only from matching cached snapshot fields.
export function manualReviewGame(sport,gameId,snapshot){
 if(!snapshot||String(snapshot.gameId)!==String(gameId))throw Error('snapshot_identity_mismatch');
 const game=sport==='NBA'?{gameId:String(gameId),home:snapshot.home,away:snapshot.away,kickoff:snapshot.kickoff}:snapshot.game;
 if(!game||String(game.gameId)!==String(gameId)||!game.home?.abbr||!game.away?.abbr||
  game.home.abbr===game.away.abbr)throw Error('game_metadata_missing');
 return game;
}
