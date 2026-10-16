// Validate game-to-venue linkage from server-owned schedule metadata.
// Roof status on retractable-roof stadiums must come from game-specific evidence.
import {validateNflVenue} from './nfl-venue-validation.js';
export function validateTrustedGameVenue({gameId,venue,now=Date.now()}={}){
 const id=String(gameId||'');
 if(!venue||typeof venue!=='object'||Array.isArray(venue))throw Error('invalid_venue');
 if(String(venue.gameId||'')!==id)throw Error('venue_game_mismatch');
 if(typeof venue.stadiumId!=='string'||!/^[-a-z0-9_]{3,80}$/i.test(venue.stadiumId))throw Error('stadium_id_missing');
 if(typeof venue.scheduleSource!=='string'||!/^https:\/\//.test(venue.scheduleSource))throw Error('schedule_source_missing');
 const scheduleUrl=new URL(venue.scheduleSource);
 if(!['www.espn.com','site.api.espn.com','www.nfl.com','nfl.com'].includes(scheduleUrl.hostname.toLowerCase())||scheduleUrl.username||scheduleUrl.password)throw Error('schedule_source_not_allowlisted');
 const kickoff=Date.parse(venue.kickoffAt||'');
 if(!Number.isFinite(kickoff)||Math.abs(kickoff-Number(now))>1000*60*60*24*21)throw Error('kickoff_outside_review_window');
 if(venue.retractableRoof===true&&!['open','closed'].includes(String(venue.roofStatus||'').toLowerCase()))throw Error('retractable_roof_unconfirmed');
 if(venue.retractableRoof===true&&(!venue.roofEvidence||typeof venue.roofEvidence!=='string'))throw Error('retractable_roof_evidence_missing');
 if(venue.retractableRoof===true){let roofUrl;try{roofUrl=new URL(venue.roofEvidence)}catch{throw Error('invalid_roof_evidence_url')}
  if(roofUrl.protocol!=='https:'||!['www.nfl.com','nfl.com','www.espn.com'].includes(roofUrl.hostname.toLowerCase()))throw Error('untrusted_roof_evidence_source');
 }
 return validateNflVenue({gameId:id,venue});
}
