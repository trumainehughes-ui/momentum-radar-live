// Read-only historical SGP audit. Accepts locked, pregame tickets with verified final results.
// Does not infer a loss from missing settlement data or use model-only odds as book quotes.
const finite = v => typeof v === 'number' && Number.isFinite(v);
const key = v => String(v ?? '').trim();
const validLeg = leg => leg && key(leg.playerId) && key(leg.stat) &&
  finite(leg.target) && finite(leg.actual) &&
  (leg.direction === 'over' || leg.direction === 'under');
const hit = leg => leg.direction === 'over'
  ? leg.actual > leg.target : leg.actual < leg.target;
export function auditSgpHistory(tickets = []) {
  const byTier = {}, byStat = {}, exclusions = {};
  const excluded = reason => { exclusions[reason] = (exclusions[reason] || 0) + 1; };
  const seen = new Set();
  for (const ticket of tickets) {
    if (!ticket || !key(ticket.id) || !key(ticket.eventId) || !key(ticket.tier)) {
      excluded('missing_ticket_identity'); continue;
    }
    const id = key(ticket.eventId) + ':' + key(ticket.id);
    if (seen.has(id)) { excluded('duplicate_ticket'); continue; }
    seen.add(id);
    if (!finite(ticket.lockedAt) || !finite(ticket.kickoffAt) ||
        ticket.lockedAt >= ticket.kickoffAt) {
      excluded('not_verified_pregame'); continue;
    }
    if (!Array.isArray(ticket.legs) || !ticket.legs.length ||
        ticket.legs.some(leg => !validLeg(leg) || leg.finalVerified !== true)) {
      excluded('incomplete_settlement'); continue;
    }
    const legKeys = ticket.legs.map(l => [key(l.playerId),key(l.stat),l.direction,l.target].join(':'));
    if (new Set(legKeys).size !== legKeys.length) {
      excluded('duplicate_leg'); continue;
    }
    const outcomes = ticket.legs.map(hit);
    const hits = outcomes.filter(Boolean).length;
    const tier = byTier[ticket.tier] ||= {tickets:0,wins:0,oneLegAway:0,legs:0,legHits:0};
    tier.tickets++; tier.wins += Number(hits === outcomes.length);
    tier.oneLegAway += Number(hits === outcomes.length - 1);
    tier.legs += outcomes.length; tier.legHits += hits;
    ticket.legs.forEach((leg,i) => {
      const stat = byStat[leg.stat] ||= {legs:0,hits:0,misses:0,totalMissDistance:0};
      stat.legs++;
      if (outcomes[i]) stat.hits++;
      else {
        stat.misses++;
        stat.totalMissDistance += Math.abs(leg.actual - leg.target);
      }
    });
  }
  const tiers = Object.fromEntries(Object.entries(byTier).map(([name,v]) => [name,{
    ...v, ticketHitRate:v.wins/v.tickets, legHitRate:v.legHits/v.legs,
    oneLegAwayRate:v.oneLegAway/v.tickets
  }]));
  const stats = Object.fromEntries(Object.entries(byStat).map(([name,v]) => [name,{
    ...v, hitRate:v.hits/v.legs,
    meanMissDistance:v.misses ? v.totalMissDistance/v.misses : null
  }]));
  return {tiers,stats,exclusions};
}
