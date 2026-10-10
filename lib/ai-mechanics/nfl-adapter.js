// Read-only boundary between the existing NFL data shape and AI evidence gates.
import { verifyPlayerMarket } from "./evidence.js";
export function assessNflPropEvidence({ pick, roster = [], markets = [], now } = {}) {
  if (!pick || !pick.playerId || !pick.team || !pick.market || !Number.isFinite(now)) return { verified:false, reasons:["incomplete_pick_or_time"] };
  const player=roster.find(p=>String(p.id)===String(pick.playerId) && p.team===pick.team);
  const market=markets.find(m=>String(m.playerId)===String(pick.playerId) && m.team===pick.team && m.market===pick.market && m.line===pick.line && m.sportsbook===pick.sportsbook);
  const result=verifyPlayerMarket({player,market,now});
  return { ...result, advisoryOnly:true, playerFound:!!player, marketFound:!!market };
}
