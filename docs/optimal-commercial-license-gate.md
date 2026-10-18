# Optimal Sports Projections: commercialization gate

## License status (2026-10-18)

Optimal Sports' [Terms of Use](https://www.optimal-bet.com/terms), section 3.4.2,
limit standard MCP/API access and Sports Data to personal, non-commercial,
internal use. They prohibit redistribution and use for competing products.
The ChatGPT connection is **not** a license to make raw projection percentiles
available to Momentum Radar's public customers.

**Until Optimal grants written commercial use AND public redistribution rights
covering the intended use, do not connect its MCP endpoint to production,
republish its sports data to the public, send scheduled bulk requests, or
enable the Vercel import route.** Do not store an MCP key in client JavaScript,
commit messages, Github files, or a public URL. Do not upload extracted
projections into a public Blob bucket without licensed redistribution rights.

## Fail-closed implementation

- `api/optimal-projection-reference.js` rejects GET and POST with HTTP 451
  and `DISABLED_LICENSE_REQUIRED` when
  `MOMENTUM_OPTIMAL_COMMERCIAL_LICENSE_APPROVED` is absent or not exactly
  `true`. This environmental control does not by itself grant legal rights.
- Production and customer-facing pages do not load the Optimal cross-check
  UI, so they use existing Momentum AI without this data.
- The dormant reference normalizer and comparison code remain available
  for a future separately licensed integration.
- NFL/NBA SGP integrity guards must work independently of Optimal:
  Small 4 legs, Medium 5 legs, Nuke 5–7 legs; injury/roster and exact
  DraftKings/FanDuel lines plus authenticated bookmaker combined odds
  remain mandatory for a playable SGP.

## Approval process

Obtain a written vendor agreement specifically permitting Momentum Radar to
use Optimal's data in a commercial third-party product and to republish the
planned projection fields to public users, with permitted leagues, refresh
frequency, retention, attribution, sublicensing and termination documented.
Have the owner review the agreement and permitted architecture before
creating any credentials, turning on the gate, or deploying client views.

For legitimate personal research within ChatGPT, use the installed Optimal
plugin as a separate conversation tool, not the production service.
