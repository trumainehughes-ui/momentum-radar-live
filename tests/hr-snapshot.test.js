import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { buildSnapshot, getOrCreateSnapshot, isPregameSlate } from '../api/hr-snapshot.js';

function player(name, id, team, opponent, homeRuns, battingOrder) {
  return {
    playerId: id,
    name,
    team,
    opponent,
    battingOrder,
    stats: { plateAppearances: 300, homeRuns, slg: .500 },
    recent: {
      last5: { plateAppearances: 20, homeRuns: 1 },
      last10: { plateAppearances: 40, homeRuns: 2 },
      last20: { plateAppearances: 80, homeRuns: 4 }
    },
    hrModel: { parkFactor: 100, weatherFactor: 1 },
    pitcherProfile: { hr9: 1.2, era: 4.2 }
  };
}

const date = '2099-07-04';
const slate = {
  games: [
    { status: 'Scheduled', home: { abbr: 'AAA' }, away: { abbr: 'BBB' } },
    { status: 'Pre-Game', home: { abbr: 'CCC' }, away: { abbr: 'DDD' } }
  ]
};
const initialRankings = {
  fetchedAt: '2099-07-04T12:00:00.000Z',
  source: 'test',
  rankings: { HR: [
    player('Alice Primary', '1', 'AAA', 'BBB', 30, 3),
    player('Bob Shadow', '2', 'AAA', 'BBB', 10, 4),
    player('Carol Primary', '3', 'CCC', 'DDD', 25, 3),
    player('Dan Shadow', '4', 'CCC', 'DDD', 8, 4)
  ] }
};

function memoryDependencies(rankingsRef) {
  const blobs = new Map();
  const list = async ({ prefix }) => ({ blobs: blobs.has(prefix) ? [{ pathname: prefix, url: `memory://${prefix}` }] : [] });
  const put = async (pathname, body) => {
    if (blobs.has(pathname)) throw new Error('blob_exists');
    blobs.set(pathname, body);
    return { pathname, url: `memory://${pathname}` };
  };
  const fetch = async (input) => {
    const url = String(input);
    if (url.startsWith('memory://')) {
      const pathname = url.slice('memory://'.length);
      return { ok: blobs.has(pathname), status: blobs.has(pathname) ? 200 : 404, json: async () => JSON.parse(blobs.get(pathname)) };
    }
    const route = new URL(url).searchParams.get('route');
    return { ok: true, status: 200, json: async () => route === 'rankings' ? rankingsRef.current : slate };
  };
  return { blobs, list, put, fetch, currentDate: date };
}

function clientContext() {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const body = script.slice(0, script.lastIndexOf('\ndocument.querySelectorAll'));
  const quick = { innerHTML: '' };
  const context = {
    document: { querySelector: () => quick, querySelectorAll: () => [] },
    quick,
    console,
    Intl,
    Date,
    URLSearchParams
  };
  vm.createContext(context);
  vm.runInContext(body, context);
  return context;
}

test('builds Primary and Shadow snapshot identities', () => {
  const snapshot = buildSnapshot(date, initialRankings, slate, '2099-07-04T12:00:00.000Z');
  assert.equal(snapshot.date, date);
  assert.equal(snapshot.createdAt, '2099-07-04T12:00:00.000Z');
  assert.ok(snapshot.selections.some((row) => row.name === 'Alice Primary' && row.predictionType === 'Primary'));
  assert.ok(snapshot.selections.some((row) => row.name === 'Bob Shadow' && row.predictionType === 'Shadow'));
  for (const row of snapshot.selections) {
    assert.deepEqual(Object.keys(row).filter((key) => ['playerId', 'name', 'team', 'opponent', 'predictionType'].includes(key)).sort(), ['name', 'opponent', 'playerId', 'predictionType', 'team']);
  }
});

test('returns one immutable snapshot across refreshes and fresh clients', async () => {
  const rankingsRef = { current: initialRankings }, dependencies = memoryDependencies(rankingsRef);
  const first = await getOrCreateSnapshot(date, dependencies);
  rankingsRef.current = {
    ...initialRankings,
    fetchedAt: '2099-07-04T13:00:00.000Z',
    rankings: { HR: [player('Changed Live Ranking', '99', 'AAA', 'BBB', 60, 3)] }
  };
  const repeated = await getOrCreateSnapshot(date, dependencies);
  const freshClient = await getOrCreateSnapshot(date, { ...dependencies });
  assert.deepEqual(repeated, first);
  assert.deepEqual(freshClient, first);
  assert.equal(dependencies.blobs.size, 1);
  assert.ok(!first.selections.some((row) => row.name === 'Changed Live Ranking'));
});

test('recognizes pregame and started slates', () => {
  assert.equal(isPregameSlate(slate), true);
  assert.equal(isPregameSlate({ games: [{ status: 'In Progress' }] }), false);
  assert.equal(isPregameSlate({ games: [{ status: 'Final' }] }), false);
});

test('does not reconstruct a missing historical snapshot', async () => {
  const rankingsRef = { current: initialRankings }, dependencies = memoryDependencies(rankingsRef);
  dependencies.currentDate = '2099-07-05';
  await assert.rejects(() => getOrCreateSnapshot(date, dependencies), (error) => error.reason === 'historical_snapshot_unavailable');
  assert.equal(dependencies.blobs.size, 0);
});

test('server snapshot uses the same Primary and Shadow selections as the page model', () => {
  const snapshot = buildSnapshot(date, initialRankings, slate, '2099-07-04T12:00:00.000Z');
  const context = clientContext();
  context.fixtureRankings = initialRankings.rankings;
  context.fixtureSlate = slate;
  vm.runInContext("rankings=fixtureRankings;slate=fixtureSlate;clientResult={primary:divHR((rankings.HR||[]).filter(eligible),10).map(p=>p.playerId),shadow:shadowRows().map(x=>x.shadow.playerId)}", context);
  assert.deepEqual(snapshot.selections.filter((row) => row.predictionType === 'Primary' || row.predictionType === 'Both').map((row) => row.playerId), Array.from(context.clientResult.primary));
  assert.deepEqual(snapshot.selections.filter((row) => row.predictionType === 'Shadow' || row.predictionType === 'Both').map((row) => row.playerId), Array.from(context.clientResult.shadow));
});

test('HR Tracker renders all four attribution cases and summary totals', () => {
  const context = clientContext();
  const clientDate = vm.runInContext('dateLocal()', context);
  context.fixtureSnapshot = {
    version: 1,
    date: clientDate,
    createdAt: new Date().toISOString(),
    selections: [
      { name: 'Alice', predictionType: 'Primary' },
      { name: 'Bob', predictionType: 'Shadow' },
      { name: 'Eve', predictionType: 'Both' }
    ]
  };
  context.fixtureTracker = [
    { name: 'Alice', homeRuns: 1 },
    { name: 'Bob', homeRuns: 2 },
    { name: 'Dana', homeRuns: 1 },
    { name: 'Eve', homeRuns: 3 }
  ];
  vm.runInContext('trackerSnapshot=fixtureSnapshot;tracker=fixtureTracker;cat="TRACKER";renderTracker()', context);
  const output = context.quick.innerHTML;
  for (const expected of [
    'Alice ⭐',
    'Bob 🌘',
    'Dana</div>',
    'Eve ⭐🌘',
    '<b>4</b><small>Primary Hits',
    '<b>5</b><small>Shadow Hits',
    '<b>3</b><small>Overlap Hits',
    '<b>1</b><small>Missed HRs'
  ]) assert.ok(output.includes(expected), `missing ${expected}`);
});
