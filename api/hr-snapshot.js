import { list, put } from '@vercel/blob';

const SOURCE_API = process.env.MLB_SOURCE_API_URL || 'https://momentum-radar-live-j0vpacxpm-trumainehughes-6743.vercel.app/api';
const SNAPSHOT_PREFIX = 'mlb-hr-snapshots/v1';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function gameKey(player) {
  return [String(player.team || ''), String(player.opponent || '')].sort().join('|');
}

function gameFor(player, slate) {
  return (slate.games || []).find((game) =>
    [game.home?.abbr, game.away?.abbr].filter(Boolean).sort().join('|') === gameKey(player));
}

function upcoming(game) {
  const status = String(game?.status || '').toLowerCase();
  return !/(in progress|final|game over|completed|postponed|cancelled|canceled|suspended)/.test(status);
}

function eligible(player, slate) {
  const game = gameFor(player, slate);
  return !game || upcoming(game);
}

function expectedPA(player) {
  const order = Number(player.battingOrder) || 5;
  return order <= 2 ? 4.65 : order <= 4 ? 4.45 : order <= 6 ? 4.2 : order <= 8 ? 3.95 : 3.8;
}

function marketImp(player) {
  const price = Number(player.bestBook?.price);
  if (!Number.isFinite(price) || !price) return null;
  return price > 0 ? 100 / (price + 100) : (-price) / (-price + 100);
}

export function hrP(player) {
  const stats = player.stats || {}, model = player.hrModel || {}, pa = +stats.plateAppearances || 0, hr = +stats.homeRuns || 0;
  if (!pa) return 0;
  const prior = .032, priorPA = 100, season = (hr + prior * priorPA) / (pa + priorPA);
  const recentWindow = (window, shrink) => {
    const recent = player.recent?.[window] || {}, recentPA = +recent.plateAppearances || 0, recentHR = +recent.homeRuns || 0;
    return recentPA ? (recentHR + season * shrink) / (recentPA + shrink) : season;
  };
  const per = clamp(season * .45 + recentWindow('last20', 55) * .25 + recentWindow('last10', 45) * .20 + recentWindow('last5', 35) * .10, .004, .105);
  let probability = 1 - Math.pow(1 - per, expectedPA(player));
  probability *= clamp((+model.parkFactor || 100) / 100, .84, 1.18) * clamp(+model.weatherFactor || 1, .90, 1.12);
  const pitcher = player.pitcherProfile || {};
  if (+pitcher.hr9 > 0) probability *= clamp(1 + ((+pitcher.hr9) - 1.15) * .12, .88, 1.15);
  if (+pitcher.era > 0) probability *= clamp(1 + ((+pitcher.era) - 4.15) * .018, .94, 1.07);
  const slg = +stats.slg || 0;
  if (slg) probability *= clamp(1 + (slg - .420) * .30, .93, 1.10);
  const order = +player.battingOrder || 5;
  if (order <= 2) probability *= 1.04;
  else if (order >= 8) probability *= .95;
  const statcast = player.statcast || {}, pitcherStatcast = player.pitcherStatcast || {};
  for (const [value, baseline, weight, low, high] of [[+statcast.barrelPct, 8, .01, .91, 1.12], [+statcast.hardHitPct, 40, .0035, .94, 1.08], [+statcast.avgEV, 89, .014, .95, 1.07], [+pitcherStatcast.barrelPctAllowed, 8, .009, .93, 1.10], [+pitcherStatcast.hardHitPctAllowed, 40, .0025, .96, 1.07]]) {
    if (Number.isFinite(value) && value > 0) probability *= clamp(1 + (value - baseline) * weight, low, high);
  }
  if (player.pitchArsenal?.available) probability *= clamp(+player.pitchArsenal.adjustment || 1, .92, 1.08);
  const market = marketImp(player);
  if (market != null) probability = probability * .95 + market * .05;
  return Math.round(clamp(probability, .03, .45) * 100);
}

export function divHR(rows, count = 5) {
  const games = new Set(), teams = new Set(), selected = [];
  for (const player of [...rows].sort((a, b) => hrP(b) - hrP(a))) {
    const game = gameKey(player), team = String(player.team || '');
    if (games.has(game) || teams.has(team)) continue;
    games.add(game);
    teams.add(team);
    selected.push(player);
    if (selected.length >= count) break;
  }
  return selected;
}

function shadowComponents(player, gameRows = []) {
  const stats = player.stats || {}, pitcher = player.pitcherProfile || {}, model = player.hrModel || {}, recent = player.recent || {}, order = +player.battingOrder || 5;
  const power = Math.round(clamp(hrP(player) * 2.7, 0, 100));
  const pitcherScore = Math.round(clamp(50 + ((+pitcher.hr9 || 1.15) - 1.15) * 28 + ((+pitcher.era || 4.15) - 4.15) * 3, 20, 95));
  const ops = +player.platoon?.ops || +recent.ops || +stats.ops || .720;
  const arsenal = player.pitchArsenal?.available ? (+player.pitchArsenal.edgePct || 0) : 0;
  const matchup = Math.round(clamp(50 + (ops - .720) * 70 + arsenal * 1.6, 20, 95));
  const park = Math.round(clamp(50 + ((+model.parkFactor || 100) - 100) * 2.1, 20, 95));
  const weatherFactor = +model.weatherFactor || 1;
  const weather = Math.round(clamp(50 + (weatherFactor - 1) * 250, 20, 90));
  const recentHR = (+recent.last5?.homeRuns || 0) * 5 + (+recent.last10?.homeRuns || 0) * 2.5 + (+recent.last20?.homeRuns || 0) * 1.25;
  const recentScore = Math.round(clamp(38 + recentHR * 6 + (+recent.ops > 0 ? ((+recent.ops - .720) * 40) : 0), 20, 95));
  const averageGame = gameRows.length ? gameRows.reduce((total, row) => total + hrP(row), 0) / gameRows.length : hrP(player);
  const environment = Math.round(clamp(averageGame * 2 + park * .25 + weather * .15, 20, 95));
  const lineup = Math.round(clamp(82 - Math.abs(order - 3.5) * 7, 35, 88));
  return { power, pitcher: pitcherScore, matchup, environment, recent: recentScore, park, weather, bullpen: 50, lineup };
}

function shadowScore(player, gameRows = []) {
  const scores = shadowComponents(player, gameRows);
  return Math.round(scores.power * .24 + scores.pitcher * .18 + scores.matchup * .14 + scores.environment * .10 + scores.recent * .10 + scores.park * .08 + scores.weather * .06 + scores.bullpen * .05 + scores.lineup * .05);
}

export function shadowRows(rows) {
  const targets = divHR(rows, 10), output = [];
  for (const target of targets) {
    const teamRows = rows.filter((player) => player.team === target.team && gameKey(player) === gameKey(target));
    const targetOrder = +target.battingOrder || 0;
    if (!targetOrder) continue;
    const targetScore = shadowScore(target, teamRows);
    for (const shadow of teamRows) {
      const shadowOrder = +shadow.battingOrder || 0;
      if (!shadowOrder || shadow.name === target.name || Math.abs(shadowOrder - targetOrder) > 2) continue;
      const score = shadowScore(shadow, teamRows), components = shadowComponents(shadow, teamRows), differential = score - targetScore;
      const flag = differential >= 3 ? 'OVERLAP' : components.environment >= 72 ? 'HOT GAME' : score >= 65 ? 'WATCH' : 'NEIGHBOR';
      output.push({ target, shadow, targetScore, score, diff: differential, flag, c: components });
    }
  }
  return output.sort((a, b) => b.score - a.score || b.diff - a.diff).slice(0, 18);
}

function playerToken(player) {
  return String(player?.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function playerKey(player) {
  const id = player?.playerId ?? player?.mlbId ?? player?.personId;
  return id != null && String(id) ? `id:${id}` : `name:${playerToken(player)}`;
}

function snapshotPlayer(player) {
  return {
    playerId: String(player?.playerId ?? player?.mlbId ?? player?.personId ?? ''),
    name: player?.name || '',
    team: player?.team || '',
    opponent: player?.opponent || ''
  };
}

export function buildSnapshot(date, rankingsPayload, slate, createdAt = new Date().toISOString()) {
  const eligibleRows = (rankingsPayload.rankings?.HR || []).filter((player) => eligible(player, slate));
  if (!eligibleRows.length) throw new SnapshotUnavailableError('predictions_unavailable');
  const primary = divHR(eligibleRows, 10), shadows = shadowRows(eligibleRows).map((row) => row.shadow);
  const selections = new Map();
  primary.forEach((player, index) => selections.set(playerKey(player), { ...snapshotPlayer(player), predictionType: 'Primary', primaryRank: index + 1 }));
  shadows.forEach((player, index) => {
    const key = playerKey(player), existing = selections.get(key);
    selections.set(key, existing
      ? { ...existing, predictionType: 'Both', shadowRank: index + 1 }
      : { ...snapshotPlayer(player), predictionType: 'Shadow', shadowRank: index + 1 });
  });
  return {
    version: 1,
    date,
    createdAt,
    sourceRankingsFetchedAt: rankingsPayload.fetchedAt || null,
    source: rankingsPayload.source || null,
    selections: [...selections.values()]
  };
}

export function isPregameSlate(slate) {
  const games = slate.games || [];
  if (!games.length) return false;
  return games.every((game) => !/(in progress|final|game over|completed|suspended)/i.test(String(game.status || '')));
}

export function currentMlbDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export class SnapshotUnavailableError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'SnapshotUnavailableError';
    this.reason = reason;
  }
}

function snapshotPath(date) {
  return `${SNAPSHOT_PREFIX}/${date}.json`;
}

export async function readSnapshot(date, dependencies = {}) {
  const listBlobs = dependencies.list || list, fetchImpl = dependencies.fetch || fetch, pathname = snapshotPath(date);
  const result = await listBlobs({ prefix: pathname, limit: 10 });
  const blob = result.blobs?.find((item) => item.pathname === pathname);
  if (!blob) return null;
  const response = await fetchImpl(blob.url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`snapshot_read_${response.status}`);
  return response.json();
}

async function sourceJson(route, date, fetchImpl) {
  const url = new URL(SOURCE_API);
  url.search = new URLSearchParams({ route, date, ts: Date.now() });
  const response = await fetchImpl(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`source_${route}_${response.status}`);
  return response.json();
}

export async function getOrCreateSnapshot(date, dependencies = {}) {
  const fetchImpl = dependencies.fetch || fetch, putBlob = dependencies.put || put;
  const existing = await readSnapshot(date, dependencies);
  if (existing) return existing;
  const today = dependencies.currentDate || currentMlbDate();
  if (date !== today) throw new SnapshotUnavailableError(date < today ? 'historical_snapshot_unavailable' : 'snapshot_not_yet_available');
  const [rankingsPayload, slate] = await Promise.all([
    sourceJson('rankings', date, fetchImpl),
    sourceJson('slate', date, fetchImpl)
  ]);
  if (!isPregameSlate(slate)) throw new SnapshotUnavailableError('pregame_snapshot_unavailable');
  const created = buildSnapshot(date, rankingsPayload, slate);
  try {
    await putBlob(snapshotPath(date), JSON.stringify(created), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'application/json'
    });
    return created;
  } catch (error) {
    const winner = await readSnapshot(date, dependencies);
    if (winner) return winner;
    throw error;
  }
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (request.method !== 'GET') return response.status(405).json({ available: false, error: 'method_not_allowed' });
  const date = String(request.query.date || '');
  if (!DATE_RE.test(date)) return response.status(400).json({ available: false, error: 'invalid_date' });
  try {
    const snapshot = await getOrCreateSnapshot(date);
    return response.status(200).json({ available: true, snapshot });
  } catch (error) {
    if (error instanceof SnapshotUnavailableError) {
      return response.status(404).json({ available: false, date, reason: error.reason });
    }
    console.error('HR snapshot error', error);
    return response.status(503).json({ available: false, date, error: 'snapshot_storage_unavailable' });
  }
}
