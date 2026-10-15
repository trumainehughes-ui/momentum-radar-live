// Validate source-backed NFL venue metadata before any stadium forecast request.
// Coordinates must come from verified venue records, not guessed from a city name.
const numeric=(x,min,max)=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))&&Number(x)>=min&&Number(x)<=max?Number(x):null;
export function validateNflVenue({venue,gameId}={}){
 if(!/^\d{7,12}$/.test(String(gameId||'')))throw Error('invalid_game_id');
 if(!venue||typeof venue!=='object'||Array.isArray(venue))throw Error('invalid_venue');
 const roofStatus=String(venue.roofStatus||'unknown').toLowerCase();
 if(!['outdoor','open','closed','indoor','dome','unknown'].includes(roofStatus))throw Error('invalid_roof_status');
 const kickoff=Date.parse(venue.kickoffAt||'');
 if(!Number.isFinite(kickoff))throw Error('invalid_kickoff');
 if(['outdoor','open'].includes(roofStatus)){
  const latitude=numeric(venue.latitude,18,72),longitude=numeric(venue.longitude,-170,-60);
  if(latitude===null||longitude===null)throw Error('invalid_stadium_coordinates');
  if(typeof venue.venueSource!=='string'||!venue.venueSource.trim()||venue.venueSource.length>200)throw Error('unverified_stadium_metadata');
  return {gameId:String(gameId),roofStatus,kickoffAt:new Date(kickoff).toISOString(),latitude,longitude,venueSource:venue.venueSource.trim()};
 }
 return {gameId:String(gameId),roofStatus,kickoffAt:new Date(kickoff).toISOString(),latitude:null,longitude:null,
  venueSource:typeof venue.venueSource==='string'?venue.venueSource.slice(0,200):null};
}
