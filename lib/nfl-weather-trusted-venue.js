// Server-owned venue records for weather previews.
import {validateTrustedGameVenue} from './nfl-weather-game-venue.js';
// Client-provided coordinates, roof status and source labels are never trusted.
export function resolveServerWeatherVenue({gameId,requestVenue,registryJson=process.env.NFL_WEATHER_VENUES_JSON}={}){
 const id=String(gameId||'');
 if(!/^\d{7,12}$/.test(id))throw Error('invalid_game_id');
 let registry;
 try{registry=JSON.parse(registryJson||'{}')}catch{throw Error('invalid_venue_registry')}
 if(!registry||typeof registry!=='object'||Array.isArray(registry))throw Error('invalid_venue_registry');
 if(!Object.prototype.hasOwnProperty.call(registry,id))throw Error('venue_not_configured');
 const trusted=registry[id];
 if(!trusted||typeof trusted!=='object'||Array.isArray(trusted))throw Error('invalid_venue_record');
 // Never merge requestVenue into the trusted record.
 return Object.freeze({...trusted,...validateTrustedGameVenue({gameId:id,venue:trusted})});
}
