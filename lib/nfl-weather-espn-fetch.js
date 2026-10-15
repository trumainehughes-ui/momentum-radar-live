// Read an NFL event directly from ESPN, not from the weather preview caller.
import {verifyEspnNflGameSummary} from './nfl-weather-espn-game.js';
export async function fetchVerifiedEspnNflGame({gameId,fetcher=fetch}={}){
 const id=String(gameId||'');
 if(!/^\d{7,12}$/.test(id))throw Error('invalid_game_id');
 if(typeof fetcher!=='function')throw Error('invalid_fetcher');
 const url='https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event='+encodeURIComponent(id);
 const response=await fetcher(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(7000)});
 if(!response?.ok)throw Error('schedule_fetch_failed');
 return verifyEspnNflGameSummary({gameId:id,summary:await response.json()});
}
