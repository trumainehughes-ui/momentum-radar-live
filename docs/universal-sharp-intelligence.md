# Momentum Radar — universal Sharp Intelligence contract (v1)

**Applies to NFL, NBA, MLB, NHL, soccer and every future sport module.** The sport adapter supplies sport-specific evidence; the shared evaluator in `lib/ai-mechanics/sharp-engine.js` owns pricing maths, verification gates, probability calibration checks, risk sizing and abstention decisions.

## Mandatory execution order
1. **Gather:** Sport adapter fetches authorized odds and immutable as-of timestamps, latest current-game player and lineup/availability evidence, relevant season/game samples, positional matchup stats, injuries, rest/travel/weather where applicable. Preserve raw provider data server-side only. Build source-labeled audit records. Bookmaker public page accessibility alone is not authorization to scrape around restrictions.
2. **Cross-verify:** Independently check player/team/game/market/side/line identity, two current confirmed bookmaker offers, two truly independent verified sources, exact timestamps and official-vs-reported injury statuses. If feeds disagree, hold the candidate for review; never interpolate a missing line or infer "sharp money" from movement.
3. **Evaluate:** The **sport's out-of-sample calibrated binary-event probability** supplies p, lower95, upper95 plus an independently audited, versioned calibration record (200+ representative outcomes and Brier score, validated within 120 days). The reusable evaluator calculates bookmaker implied probability, estimated and lower-bound expected ROI and a stake capped at 0.5 units. If calibration/price is missing or the conservative expected ROI is not greater than 1%, it returns WAIT / REVIEW / PASS.

## Future-sport adapter data contract

```js
import {evaluateSharpSlate} from './lib/ai-mechanics/sharp-engine.js';

const report=evaluateSharpSlate({
  sport: 'your-new-sport', gameId: 'your-event-id',
  sources: [ // completed by server only AFTER independent validation
    {sourceId: 'verified-roster-provider', checkedAt: iso, verifiedByServer: true},
    {sourceId: 'separate-market-provider', checkedAt: iso, verifiedByServer: true}
  ],
  situational: {checkedByServer: true, weatherApplicable: false},
  candidates: [{
    playerId: 'actual-player-id', name: 'Actual Player',
    market: 'exact-market-id', side: 'OVER', line: 'exact-line',
    bookOffer: {
      sport: 'your-new-sport', gameId: 'your-event-id',
      playerId: 'actual-player-id', market: 'exact-market-id',
      side: 'OVER', line: 'exact-line',
      book: 'DraftKings', americanOdds: '+150',
      checkedAt: iso, available: true, sourceUrl: 'https://actual-book-source'
    },
    consensusOffers: [ /* independent, same line/side, recently validated */ ],
    eligibility: {status:'CLEARED', verifiedByServer:true, checkedAt:iso},
    probability: {
      estimate:0.50, lower95:0.43, upper95:0.58,
      calibration:{status:'OUT_OF_SAMPLE_VERIFIED',
        certifiedBy:'MOMENTUM_MODEL_VALIDATOR',
        modelVersion:'your-sport-validated-model-v1',
        sampleSize:250, auditedAt:iso, brierScore:0.19}
    },
    movement: { // optional; never fabricate sharp/public-money direction
      opening:{americanOdds:'+160',checkedAt:iso},
      // historical CLV requires a matching actual VERIFIED entry and close,
      // not merely opening versus closing lines
      entry:null, closing:null, bettingSplits:null
    }
  }]
}, {now:Date.now(), trustedServerEvidence:true});
```

**Trust warning:** `trustedServerEvidence:true` is for **trusted internal collectors/validated signed server workflows only**, never data forwarded from a browser, public endpoint, remote model, or arbitrary user payload. The public `/api/ai-analysis` `sharp` mode intentionally evaluates all user-supplied data at untrusted level and cannot issue a +EV verdict or positive stake even when client flags claim verified.

### Enforcement and authority

- **Autonomous without approval:** refresh permitted existing data feeds on their schedules; check identities, injuries, probabilities, regression performance, trends, proposed rankings, and risk alerts; publish *validated derived analysis* via the existing protected deployment process.
- **Never autonomous without separate authorization:** place/void bets; change someone's bookmaker wagers, bankroll or deposits; call unapproved/premium services; alter model calibration/audited weights based on AI prose; edit sportsbook odds; override injury holds or identity gates; let anonymous visitors spend Groq credits.
- Only a server-side rule engine updates models; generated AI text is an explanatory and challenger layer, not a source of truth. Proposed model changes must pass offline tests, calibration/backtests and production gates before release.
- One unit is 1% of bankroll. No eligible evidence = **0 units**. A quarter-Kelly lower-95 calculation is capped at **0.5 units**, not a recommendation to chase a losing wager.
- **CLV:** compare a verified actual entry's book/selection/line/side with a subsequent *verified genuine closing quote*, never assume opening-to-current movement measures CLV.
- **SGPs:** independently quoted single-player legs do not establish a correlated SGP price; preserve separate bookmaker combined-quote verification and tier gates.

All outputs must distinguish **Market Context / Quantitative Angle / Market Movement / +EV Verdict / Bankroll Strategy** and clearly disclose missing information. Conclude with a short responsible-betting reminder.

## Acceptance checklist for any new league
A sport is not "Sharp ready" until: real game/roster identity and injury adapters, independent approved market sources, book timestamps and line selection identity, out-of-sample probability calibration and uncertainty interval, a verified model-quality audit, source conflict handling, regression tests for *missing/invalid data*, and documented league-specific factors. A league without those features can still show **model projections** and **WAIT/REVIEW** but **must not** surface "+EV verified".
