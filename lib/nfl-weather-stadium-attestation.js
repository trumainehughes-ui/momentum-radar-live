// Reject placeholder stadium identities and unsupported source attestations.
// A matching ESPN game ID alone does not verify the stadium's coordinates.
export function requireAttestedNflStadium(venue){
 if(!venue||typeof venue!=='object')throw Error('stadium_attestation_missing');
 const stadiumId=String(venue.stadiumId||'');
 if(/^(?:test|mock|demo|sample|placeholder|unknown)(?:[-_]|$)/i.test(stadiumId))throw Error('placeholder_stadium_not_allowed');
 const evidence=venue.stadiumEvidence;
 if(!evidence||typeof evidence!=='object'||Array.isArray(evidence))throw Error('stadium_attestation_missing');
 const url=String(evidence.url||'');
 let parsed;try{parsed=new URL(url)}catch{throw Error('stadium_evidence_invalid')}
 if(parsed.protocol!=='https:'||!['www.nfl.com','nfl.com','www.espn.com'].includes(parsed.hostname.toLowerCase())||parsed.username||parsed.password)throw Error('stadium_evidence_untrusted');
 if(String(evidence.stadiumId||'')!==stadiumId)throw Error('stadium_evidence_identity_mismatch');
 if(typeof evidence.checkedAt!=='string'||!Number.isFinite(Date.parse(evidence.checkedAt)))throw Error('stadium_evidence_timestamp_missing');
 // An asserted source URL is not equivalent to independently fetched source evidence.
 // Only explicit verified-source metadata is eligible for live weather reviews.
 if(evidence.verificationMethod!=='fetched_source' || evidence.verificationStatus!=='verified')throw Error('stadium_evidence_not_verified');
 if(typeof evidence.sourceGameId!=='string'||evidence.sourceGameId!==String(venue.gameId||''))throw Error('stadium_evidence_game_mismatch');
 return true;
}
