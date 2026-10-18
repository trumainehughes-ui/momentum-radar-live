import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflPublicBookTrustedOrigin} from '../api/nfl-public-book-research.js';
const root=new URL('../api/nfl-markets.js',import.meta.url);
test('preview market research always uses that preview, never a production fallback',()=>{
 const local={VERCEL_ENV:'preview',
  VERCEL_URL:'momentum-radar-live-unique123-trumainehughes-6743.vercel.app',
  VERCEL_PROJECT_PRODUCTION_URL:'momentum-radar-live.vercel.app'};
 assert.equal(nflPublicBookTrustedOrigin(local),
  'https://momentum-radar-live-unique123-trumainehughes-6743.vercel.app');
 assert.equal(nflPublicBookTrustedOrigin({...local,VERCEL_URL:'wrong-deployment.vercel.app'}),null);
 assert.equal(nflPublicBookTrustedOrigin({...local,VERCEL_URL:''}),null);
 assert.equal(nflPublicBookTrustedOrigin({...local,VERCEL_URL:'momentum-radar-live-evil.vercel.app.evil.test'}),null);
});
test('production origin can be chosen only from an explicit trusted production declaration',()=>{
 assert.equal(nflPublicBookTrustedOrigin({VERCEL_ENV:'production',
  VERCEL_PROJECT_PRODUCTION_URL:'momentum-radar-live.vercel.app'}),
  'https://momentum-radar-live.vercel.app');
 assert.equal(nflPublicBookTrustedOrigin({VERCEL_ENV:'production',
  VERCEL_PROJECT_PRODUCTION_URL:'attacker.vercel.app'}),null);
});
test('NFL markets delegate origin verification and fail closed when missing',()=>{
 const code=readFileSync(root,'utf8');
 assert.match(code,/const trustedOrigin=nflPublicBookTrustedOrigin\(process\.env\)/);
 assert.match(code,/if\(!trustedOrigin\)throw Error\('first_party_collector_deployment_identity_unverified'\)/);
 assert.match(code,/const url=trustedOrigin\+'\/api\/nfl-public-book-research\?date='/);
 assert.doesNotMatch(code,/deploymentHost:'momentum-radar-live\.vercel\.app'/);
});
