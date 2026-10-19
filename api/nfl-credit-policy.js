import {nflPaidScheduledCheckpointEnabled} from '../lib/nfl-scheduled-book-checkpoint.js';
// Read-only public configuration audit. Never expose keys or call an odds API.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 return res.status(200).json({
  ok:true,
  scheduledPaidCheckpointsEnabled:nflPaidScheduledCheckpointEnabled(),
  scheduledPaidCheckpointsDefault:'DISABLED',
  injuryChangeMonitoring:'INDEPENDENT_PATH',
  publicSportsbookPriority:['DraftKings','FanDuel'],
  supplementarySource:'TheRundown',
  supplementarySourceMayVerifyCombinedSgp:false,
  paidApiCallsTriggered:0,
  combinedQuotePipeline:'BLOCKED_BY_PUBLIC_ONLY_SOURCE_POLICY',
  combinedQuoteRequirement:'AUTHENTICATED_BOOK_ISSUED_PRICE_FOR_EXACT_LEGS',
  note:'Public sportsbook research alone does not authenticate a correlated SGP price.'
 });
}
