// Read-only bridge from a verified NFL history-grade response to the SGP audit.
// The response alone does not attest official kickoff or a final-result source.
// Callers must supply independently verified kickoff and final status.
import {auditSgpHistory} from './sgp-history-audit.js';
const validTime = value => {
  if (typeof value !== 'string' || !/(Z|[+-]\\d\\d:\\d\\d)$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};
export function auditVerifiedNflSgpGrade(response, {kickoffAt, finalVerified = false} = {}) {
  if (!response || response.ok !== true || response.final !== true ||
      finalVerified !== true || !/^\\d{7,12}$/.test(String(response.gameId ?? '')))
    return {status:'unverified_final',audit:null,publishable:false};
  const kickoff = validTime(kickoffAt);
  const locked = validTime(response.lockedAt);
  if (kickoff === null || locked === null || locked >= kickoff)
    return {status:'unverified_pregame',audit:null,publishable:false};
  const tickets = (Array.isArray(response.sgps) ? response.sgps : []).slice(0,500).map(sgp=>({
    id:sgp?.id ?? null,
    eventId:String(response.gameId),
    tier:sgp?.tier ?? sgp?.risk ?? null,
    lockedAt:locked,kickoffAt:kickoff,
    // A computed history-grade HIT is not proof of a sportsbook settlement.
    legs:(Array.isArray(sgp?.legs) ? sgp.legs : []).map(leg=>({
      playerId:leg?.playerId ?? leg?.playerID ?? null,
      stat:leg?.category ?? leg?.cat ?? null,
      target:leg?.target,
      direction:leg?.direction,
      actual:leg?.grade?.actual,
      finalVerified:leg?.grade?.sourceVerified === true,
      // Grade labels are model assessments, not sportsbook settlements.\n      // Derive only from verified numeric actual and explicit market direction.\n      settlement:null
    }))
  }));
  return {status:'audited',audit:auditSgpHistory(tickets),publishable:false,
    warning:'Research-only grade. Historical HIT/MISS does not verify a sportsbook ticket settlement.'};
}
