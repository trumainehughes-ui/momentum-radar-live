// Pure scheduling policy for inexpensive pre-weekend Sunday model generation.
// Separate from the Saturday / Sunday paid sportsbook checkpoint policy.
import {nflAddDate,nflEasternDate} from './nfl-collector-readiness.js';
import {selectedShardGames} from './pregame-collector-shards.js';

export function nflFridaySundayDate(now=Date.now()){
 const d=new Date(now);
 if(!Number.isFinite(d.getTime()))return null;
 const weekday=new Intl.DateTimeFormat('en-US',{
  timeZone:'America/New_York',weekday:'short'
 }).format(d);
 if(weekday!=='Fri')return null;
 return nflAddDate(nflEasternDate(d),2);
}
export function sundayTdPrimerGames(games,shard,{limit=16}={}){
 if(![0,1].includes(shard)||!Array.isArray(games))return [];
 const raw=games.filter(g=>{
  const ko=Date.parse(String(g?.kickoff||''));
  return g?.status==='SCHEDULED'&&Number.isFinite(ko)&&
   new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short'}).format(new Date(ko))==='Sun';
 });
 // Never run an unlimited public ESPN fan-out.
 return selectedShardGames(raw,shard).slice(0,Math.max(1,Math.min(16,limit)));
}
