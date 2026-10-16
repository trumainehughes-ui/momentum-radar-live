// Verify an ESPN NFL summary response refers to the requested game.
// This does not authenticate a caller-supplied JSON document; call from a server-side fetch only.
export function verifyEspnNflGameSummary({gameId,summary}={}){
 const id=String(gameId||'');
 if(!/^\d{7,12}$/.test(id))throw Error('invalid_game_id');
 if(!summary||typeof summary!=='object'||Array.isArray(summary))throw Error('invalid_schedule_response');
 const header=summary.header;
 const event=header?.competitions?.[0];
 if(String(header?.id||'')!==id||String(event?.id||'')!==id)throw Error('schedule_game_id_mismatch');
 const state=String(event?.status?.type?.state||summary?.header?.competitions?.[0]?.status?.type?.state||'').toLowerCase();
 const statusName=String(event?.status?.type?.name||'').toUpperCase();
 if(state!=='pre'||/POSTPONED|CANCELED|CANCELLED|SUSPENDED/.test(statusName))throw Error('schedule_not_upcoming');
 const competitors=event?.competitors;
 if(!Array.isArray(competitors)||competitors.length!==2)throw Error('schedule_teams_missing');
 const teams=competitors.map(c=>String(c?.team?.abbreviation||'').toUpperCase());
 if(teams.some(t=>!/^[A-Z]{2,4}$/.test(t))||new Set(teams).size!==2)throw Error('schedule_teams_invalid');
 const kickoffAt=event?.date||header?.competitions?.[0]?.date;
 if(!Number.isFinite(Date.parse(kickoffAt||'')))throw Error('schedule_kickoff_missing');
 const venue=event?.venue||summary?.gameInfo?.venue;
 const venueId=String(venue?.id||'');
 if(!/^\d{1,12}$/.test(venueId))throw Error('schedule_stadium_id_missing');
 return Object.freeze({gameId:id,kickoffAt:new Date(kickoffAt).toISOString(),teams,venueId});
}
