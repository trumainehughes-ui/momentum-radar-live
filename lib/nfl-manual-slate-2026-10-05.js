// Temporary sportsbook/manual analytics snapshot for ATL @ NO on 2026-10-05.
// Remove/disable once the live player-prop API is reliable.
// IMPORTANT: current-form values below use 2026 Weeks 1-3 ONLY. Prior-season Weeks 16-18 are excluded.
export const NFL_MANUAL_SLATE_2026_10_05 = {
  date: '2026-10-05',
  game: 'ATL@NO',
  temporary: true,
  currentSeasonWeeks: [1,2,3],
  excludePriorSeasonFromRecentForm: true,
  source: 'manual sportsbook screenshots',
  players: {
    'BIJANROBINSON': {team:'ATL',position:'RB', rushing:{line:87.5, odds:-113, weeks:[83,72,194], seasonAvg:116.3}, receiving:{line:35.5, odds:-113, weeks:[90,9,19], seasonAvg:39.3}, receptions:{line:4.5, odds:118, seasonAvg:4.3}, anytimeTD:-210, altRushing:{100:142,110:205,125:350,150:750,175:1400}},
    'CHRISOLAVE': {team:'NO',position:'WR', receiving:{line:84.5, odds:-113, weeks:[182,86,107], seasonAvg:125.0}, receptions:{line:6.5, odds:-132, seasonAvg:9.0}, anytimeTD:125},
    'JUWANJOHNSON': {team:'NO',position:'TE', receiving:{line:45.5, odds:-113, weeks:[54,66,53], seasonAvg:57.7}, receptions:{line:3.5, odds:-158, seasonAvg:5.0}, anytimeTD:220, altReceiving:{90:630,100:880,110:1200}},
    'DRAKELONDON': {team:'ATL',position:'WR', receiving:{line:79.5, odds:-113, weeks:[29,51,194], seasonAvg:91.3}, receptions:{line:5.5, odds:-140, seasonAvg:5.0}, anytimeTD:115},
    'KYLEPITTS': {team:'ATL',position:'TE', receiving:{line:29.5, odds:-113, weeks:[0,15,5], seasonAvg:6.7}, receptions:{line:2.5, odds:-154, seasonAvg:0.7}, anytimeTD:300},
    'JAHANDOTSON': {team:'ATL',position:'WR', receiving:{line:19.5, odds:-113, weeks:[19,11,11], seasonAvg:13.7}, receptions:{line:1.5, odds:-138, seasonAvg:1.3}, anytimeTD:430},
    'ALVINKAMARA': {team:'NO',position:'RB', rushing:{line:36.5, odds:-113, weeks:[15,36], seasonAvg:25.5}, receiving:{line:15.5, odds:-113, seasonAvg:6.0}, receptions:{line:3.5, odds:134, seasonAvg:3.0}, anytimeTD:140},
    'TYLERSHOUGH': {team:'NO',position:'QB', passing:{line:257.5, odds:-113, weeks:[410,252,255], seasonAvg:305.7}, rushing:{line:16.5, odds:-113}, passTDs:{line:1.5, overOdds:-138}, anytimeTD:280, altPassing:{225:-260,250:-138,275:132,325:390,350:640,375:1000,400:1700}},
    'MICHAELPENIXJR': {team:'ATL',position:'QB', passing:{line:224.5, odds:-113, weeks:[256], seasonAvg:256.0}, rushing:{line:4.5, odds:-113}, passTDs:{line:1.5, overOdds:104}, anytimeTD:1000, altPassing:{200:-215,225:-114,250:162,300:470,325:750,350:1260}},
    'NOAHFANT': {team:'NO',position:'TE', receiving:{line:16.5, odds:-113, weeks:[33,33], seasonAvg:22.0}, anytimeTD:550, injuryStatus:'QUESTIONABLE', altReceiving:{5:-470,10:-235,15:-138,20:116,25:172,30:235,40:430,50:800,60:1200}}
  }
};
