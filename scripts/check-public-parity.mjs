// Pull-request release gate: do not ship a customer-visible owner feature
// without its sanitized public equivalent AND a public-facing regression test.
import {execFileSync} from 'node:child_process';
const base=process.env.PARITY_BASE_SHA,head=process.env.PARITY_HEAD_SHA||'HEAD';
if(!base){console.error('PARITY_BASE_SHA is required on pull request checks');process.exit(2)}
const changed=execFileSync('git',['diff','--name-only',base,head],{
 encoding:'utf8'}).split('\n').map(s=>s.trim()).filter(Boolean);
const owner=[
 /^index\.html$/, /^public-ai\.js$/, /^public-nba\.js$/,
 /^public-nfl-impact\.js$/, /^api\/ai-analysis\.js$/,
 /^api\/(?:nfl-markets|nba-health|nfl-health)\.js$/,
 /^lib\/ai-mechanics\/.*\.js$/,
 /^lib\/nfl-anytime-td-model\.js$/
];
const mirrored=[/^picks\.html$/, /^api\/public-[^/]+\.js$/,
 /^lib\/public-[^/]+\.js$/];
const contract=/^tests\/public-[^/]+\.test\.js$/;
const ownerPaths=changed.filter(x=>owner.some(r=>r.test(x)));
if(!ownerPaths.length){
 console.log('Public parity: no owner-facing feature changes in this PR');process.exit(0);
}
const hasMirror=changed.some(x=>mirrored.some(r=>r.test(x)));
const hasTest=changed.some(x=>contract.test(x));
if(!hasMirror||!hasTest){
 console.error('PUBLIC PARITY REQUIRED: owner feature files changed:',ownerPaths);
 console.error('Update a public read-only surface (picks.html, api/public-*, lib/public-*) AND a tests/public-*.test.js contract.');
 console.error('No override: ship paired owner/public changes in the same PR.');
 process.exit(1);
}
console.log('Public parity paired with public surface and contract tests:',ownerPaths.join(', '));
