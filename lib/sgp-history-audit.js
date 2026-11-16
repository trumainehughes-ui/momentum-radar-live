// Read-only SGP accuracy audit. A push/void is not a loss; settlement of the
// complete parlay depends on the sportsbook's rules and must not be inferred.
const finite = v => typeof v === 'number' && Number.isFinite(v);
const key = v => String(v ?? '').trim();
const classify = leg => {
  if (leg.settlement === 'void') return 'void';
  if (leg.settlement === 'push') return 'push';
  if (leg.settlement === 'win' || leg.settlement === 'loss') return leg.settlement;
  if (leg.settlement !== undefined && leg.settlement !== null) return null;
  if (!finite(leg.actual) || !finite(leg.target)) return null;
  if (leg.actual === leg.target) return 'push';
  return (leg.direction === 'over' ? leg.actual > leg.target : leg.actual < leg.target) ? 'win' : 'loss';
};
export function auditSgpHistory(tickets = []) {
  const byTier = {}, byStat = {}, exclusions = {};
  const exclude = reason => { exclusions[reason] = (exclusions[reason] || 0) + 1; };
  const seen = new Set();
  for (const ticket of tickets) {
    if (!ticket || !key(ticket.id) || !key(ticket.eventId) || !key(ticket.tier)) {
      exclude('missing_ticket_identity'); continue;
    }
    const id = JSON.stringify([ticket.eventId,ticket.id]);
    if (seen.has(id)) { exclude('duplicate_ticket'); continue; }
    seen.add(id);
    if (!finite(ticket.lockedAt) || !finite(ticket.kickoffAt) ||
        ticket.lockedAt >= ticket.kickoffAt) {
      exclude('not_verified_pregame'); continue;
    }
    if (!Array.isArray(ticket.legs) || ticket.legs.length === 0 ||
        ticket.legs.some(leg => !leg || !key(leg.playerId) || !key(leg.stat) ||
          !finite(leg.target) || !['over','under'].includes(leg.direction) ||
          leg.finalVerified !== true || !classify(leg))) {
      exclude('incomplete_settlement'); continue;
    }
    const legKeys = ticket.legs.map(l => JSON.stringify([l.playerId,l.stat,l.direction,l.target]));
    if (new Set(legKeys).size !== legKeys.length) {
      exclude('duplicate_leg'); continue;
    }
    const outcomes = ticket.legs.map(classify);
    const wins = outcomes.filter(x => x === 'win').length;
    const losses = outcomes.filter(x => x === 'loss').length;
    const pushes = outcomes.filter(x => x === 'push').length;
    const voids = outcomes.filter(x => x === 'void').length;
    const tier = byTier[ticket.tier] ||= {
      tickets:0, wins:0, losses:0, unresolved:0, oneLegAway:0,
      legs:0, legWins:0, legLosses:0, pushes:0, voids:0
    };
    tier.tickets++; tier.legs += outcomes.length;
    tier.legWins += wins; tier.legLosses += losses;
    tier.pushes += pushes; tier.voids += voids;
    // Only tickets without void/push legs can be fully classified from outcomes
    // alone. Do not assume how a sportsbook reprices or voids parlays.
    if (pushes || voids) tier.unresolved++;
    else if (losses) { tier.losses++; tier.oneLegAway += Number(losses === 1); }
    else tier.wins++;
    ticket.legs.forEach((leg,i) => {
      const stat = byStat[leg.stat] ||= {
        legs:0,wins:0,losses:0,pushes:0,voids:0,totalMissDistance:0,measuredMisses:0
      };
      stat.legs++;
      stat[outcomes[i] === 'win' ? 'wins' : outcomes[i] === 'loss' ? 'losses' : outcomes[i] === 'push' ? 'pushes' : 'voids']++;
      if (outcomes[i] === 'loss' && finite(leg.actual)) {
        stat.totalMissDistance += Math.abs(leg.actual - leg.target);
        stat.measuredMisses++;
      }
    });
  }
  const tiers = Object.fromEntries(Object.entries(byTier).map(([name,v]) => [name,{
    ...v, ticketHitRate:v.wins+v.losses ? v.wins/(v.wins+v.losses) : null,
    legHitRate:v.legWins+v.legLosses ? v.legWins/(v.legWins+v.legLosses) : null,
    oneLegAwayRate:v.losses ? v.oneLegAway/v.losses : null
  }]));
  const stats = Object.fromEntries(Object.entries(byStat).map(([name,v]) => [name,{
    ...v, hitRate:v.wins+v.losses ? v.wins/(v.wins+v.losses) : null,
    meanMissDistance:v.measuredMisses
      ? v.totalMissDistance/v.measuredMisses : null
  }]));
  return {tiers,stats,exclusions};
}
