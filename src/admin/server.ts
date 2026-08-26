import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { CONFIG } from '../config';
import type { WorldState } from '../sim/types';
import { declareWar } from '../sim/war';
import { spawnStoryEvent } from '../sim/story';
import type { StoryTier } from '../sim/types';
import { saveSnapshot, loadLatest } from '../sim/snapshot';
import { SimulationHealth } from '../monitoring/health';
import { StoryQualityEngine } from '../monitoring/storyQuality';
import { BoredomAnalytics } from '../monitoring/boredomAnalytics';
import { AntiRepetition } from '../monitoring/antiRepetition';
import { CountryBalanceMonitor, WarBalanceMonitor } from '../monitoring/balance';
import { EventWatchdog, StoryWatchdog, CameraWatchdog, BroadcastWatchdog } from '../monitoring/watchdog';
import { createStore as createPredictionStore, createPrediction, castVote, resolvePrediction, getActivePredictions, getPredictionStats } from '../audience/prediction';
import { Leaderboard } from '../audience/leaderboard';
import { AudienceAnalytics } from '../audience/analytics';
import { VotingSystem } from '../audience/voting';
import { createArchive, getRecentStories, getFeaturedStories, getStoryStats, type StoryArchive } from '../content/archive';
import { createQueue, getQueueStats, type ContentQueue } from '../content/queue';
import { createAnalyticsStore, collectContentMetrics, type ContentAnalyticsStore } from '../content/analytics';

function jsonResponse(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const MAX_BODY_BYTES = 1_000_000;

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => reject(new Error('Request aborted')));
  });
}

function checkAuth(req: IncomingMessage): boolean {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(auth.slice(6), 'base64').toString();
  } catch {
    return false;
  }
  const { user, pass } = CONFIG.admin.auth;
  const expected = Buffer.from(`${user}:${pass}`, 'utf8');
  const received = Buffer.from(decoded, 'utf8');
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

function corsHeaders(res: ServerResponse, origin: string | undefined): void {
  if (origin && (CONFIG.admin.corsOrigins as readonly string[]).includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}

export interface AdminMonitorState {
  health: SimulationHealth;
  storyQuality: StoryQualityEngine;
  boredomAnalytics: BoredomAnalytics;
  antiRepetition: AntiRepetition;
  countryBalance: CountryBalanceMonitor;
  warBalance: WarBalanceMonitor;
  eventWatchdog: EventWatchdog;
  storyWatchdog: StoryWatchdog;
  cameraWatchdog: CameraWatchdog;
  broadcastWatchdog: BroadcastWatchdog;
  predictionStore: ReturnType<typeof createPredictionStore>;
  citizenLeaderboard: Leaderboard;
  audienceAnalytics: AudienceAnalytics;
  votingSystem: VotingSystem;
  storyArchive: StoryArchive;
  contentQueue: ContentQueue;
  contentAnalytics: ContentAnalyticsStore;
}

export function createAdminServer(world: WorldState, monitors?: AdminMonitorState): Server {
  const m = monitors;

  function buildStateSnapshot() {
    const activeWars = [];
    for (const war of world.wars.values()) {
      if (!war.outcome) {
        const A = world.byId.get(war.attackerId)!;
        const B = world.byId.get(war.defenderId)!;
        activeWars.push({
          id: war.id,
          attacker: { id: A.def.id, name: A.def.name },
          defender: { id: B.def.id, name: B.def.name },
          objective: war.objective,
          momentum: war.momentum,
          battles: war.battles.length,
          duration: Math.round(world.time - war.startTime),
        });
      }
    }

    const recentEvents = world.news.slice(-50).map((e) => ({
      id: e.id,
      day: e.day,
      kind: e.kind,
      actorA: e.actorA,
      actorB: e.actorB,
      headline: e.headline,
      delta: e.delta,
    }));

    return {
      world: {
        seed: world.seed,
        time: world.time,
        day: world.day,
        paused: world.paused,
        speedMultiplier: world.speedMultiplier,
      },
      countries: world.countries.map((c) => ({
        id: c.def.id,
        name: c.def.name,
        code: c.def.code,
        power: c.power,
        gdp: c.gdp,
        military: c.military,
        technology: c.technology,
        stability: c.stability,
        morale: c.morale,
        influence: c.influence,
        reputation: c.reputation,
        population: c.population,
        warId: c.warId,
        ringTarget: c.ringTarget,
      })),
      wars: activeWars,
      recentEvents,
      stats: {
        totalEvents: world.news.length,
        activeWars: activeWars.length,
        totalCountries: world.countries.length,
      },
    };
  }

  function buildHealthSnapshot() {
    if (!m) return null;
    const health = m.health.checkHealth(world);
    const quality = {
      averageScore: m.storyQuality.getAverageScore(),
      gradeDistribution: m.storyQuality.getGradeDistribution(),
      recentScores: m.storyQuality.getScores().slice(-10),
    };
    const boredom = {
      hookOutcomeRate: m.boredomAnalytics.getHookOutcomeRate(),
      badLoops: m.boredomAnalytics.identifyBadLoops(),
      recentSnapshots: m.boredomAnalytics.getSnapshots().slice(-20),
    };
    const antiRep = {
      spectacleDiversity: m.antiRepetition.getSpectacleDiversity(),
      warPairFrequency: Object.fromEntries(m.antiRepetition.getWarPairFrequency()),
    };
    const countryBalance = m.countryBalance.report(world);
    const warBalance = m.warBalance.report(world);
    const watchdogAlerts = world.monitoring.watchdogAlerts.slice(-20);

    return { health, quality, boredom, antiRep, countryBalance, warBalance, watchdogAlerts };
  }

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    corsHeaders(res, origin);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (url.pathname.startsWith('/admin')) {
      if (!checkAuth(req)) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="world-orbit-admin", charset="UTF-8"' });
        res.end('Unauthorized');
        return;
      }
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>World Orbit — Simulation Control Center</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0a0a12; color: #e0e0e0; padding: 20px; }
    h1 { color: #7aa2f7; margin-bottom: 20px; font-size: 24px; }
    .tabs { display: flex; gap: 4px; margin-bottom: 16px; }
    .tab { padding: 8px 16px; border-radius: 6px 6px 0 0; cursor: pointer; background: #1a1a2e; color: #565f89; border: 1px solid #2a2a3a; border-bottom: none; }
    .tab.active { background: #12121e; color: #7aa2f7; }
    .panel { background: #12121e; border: 1px solid #2a2a3a; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .panel h2 { color: #9ece6a; font-size: 16px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #2a2a3a; }
    th { color: #7aa2f7; font-weight: 600; }
    tr:hover { background: #1a1a2e; }
    .controls { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    button { background: #7aa2f7; color: #0a0a12; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
    button:hover { background: #89b4fa; }
    button.danger { background: #f7768e; }
    button.danger:hover { background: #ff9e64; }
    input, select { background: #1a1a2e; color: #e0e0e0; border: 1px solid #2a2a3a; padding: 8px 12px; border-radius: 6px; }
    .status { font-size: 14px; margin-bottom: 16px; display: flex; flex-wrap: wrap; gap: 8px 20px; }
    .status .label { color: #565f89; }
    .status .value { color: #c0caf5; font-weight: 600; }
    .metric-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .metric-card { background: #1a1a2e; border: 1px solid #2a2a3a; border-radius: 8px; padding: 12px; text-align: center; }
    .metric-card .value { font-size: 28px; font-weight: 700; color: #7aa2f7; }
    .metric-card .label { font-size: 11px; color: #565f89; margin-top: 4px; }
    .metric-card.warn .value { color: #e0af68; }
    .metric-card.critical .value { color: #f7768e; }
    .metric-card.good .value { color: #9ece6a; }
    .health-check { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
    .health-dot { width: 8px; height: 8px; border-radius: 50%; }
    .health-dot.pass { background: #9ece6a; }
    .health-dot.warn { background: #e0af68; }
    .health-dot.fail { background: #f7768e; }
    .alert-item { padding: 6px 0; border-bottom: 1px solid #1a1a2e; font-size: 12px; }
    .alert-item.critical { color: #f7768e; }
    .alert-item.warn { color: #e0af68; }
    .event-feed { max-height: 300px; overflow-y: auto; }
    .event-item { padding: 6px 0; border-bottom: 1px solid #1a1a2e; font-size: 12px; }
    .event-item .day { color: #565f89; }
    .event-item .kind { color: #bb9af7; margin: 0 8px; }
    .event-item .headline { color: #c0caf5; }
    .grade-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 13px; }
    .grade-S { background: #f7768e20; color: #f7768e; }
    .grade-A { background: #e0af6820; color: #e0af68; }
    .grade-B { background: #7aa2f720; color: #7aa2f7; }
    .grade-C { background: #565f8920; color: #565f89; }
    .grade-D { background: #44444420; color: #888; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    canvas { background: #0a0a12; border: 1px solid #2a2a3a; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>World Orbit — Simulation Control Center</h1>
  <div class="tabs">
    <div class="tab active" data-tab="overview">Overview</div>
    <div class="tab" data-tab="health">Health</div>
    <div class="tab" data-tab="stories">Stories</div>
    <div class="tab" data-tab="balance">Balance</div>
    <div class="tab" data-tab="events">Events</div>
  </div>

  <div id="tab-overview" class="tab-content active">
    <div class="status" id="status">Loading...</div>
    <div class="panel">
      <h2>Controls</h2>
      <div class="controls">
        <button id="pause-btn">Pause</button>
        <label>Speed: <input type="range" id="speed" min="0.25" max="4" step="0.25" value="1"> <span id="speed-val">1x</span></label>
        <button id="snapshot-btn">Save Snapshot</button>
        <button id="save-hourly">Save Hourly</button>
        <button id="save-daily">Save Daily</button>
      </div>
    </div>
    <div class="panel">
      <h2>Force War</h2>
      <div class="controls">
        <select id="attacker"></select>
        <span style="color:#565f89">vs</span>
        <select id="defender"></select>
        <button id="war-btn" class="danger">Declare War</button>
      </div>
    </div>
    <div class="metric-grid" id="overview-metrics"></div>
    <div class="panel">
      <h2>Countries</h2>
      <table>
        <thead><tr><th>Name</th><th>Power</th><th>GDP</th><th>Military</th><th>Tech</th><th>Stability</th><th>Ring</th></tr></thead>
        <tbody id="countries"></tbody>
      </table>
    </div>
    <div class="panel">
      <h2>Active Wars</h2>
      <table>
        <thead><tr><th>Attacker</th><th>Defender</th><th>Momentum</th><th>Battles</th><th>Duration</th></tr></thead>
        <tbody id="wars"></tbody>
      </table>
    </div>
  </div>

  <div id="tab-health" class="tab-content">
    <div class="metric-grid" id="health-metrics"></div>
    <div class="panel">
      <h2>Health Checks</h2>
      <div id="health-checks"></div>
    </div>
    <div class="panel">
      <h2>Watchdog Alerts</h2>
      <div id="watchdog-alerts"></div>
    </div>
    <div class="panel">
      <h2>Metrics History</h2>
      <canvas id="metrics-chart" width="1000" height="300"></canvas>
    </div>
  </div>

  <div id="tab-stories" class="tab-content">
    <div class="panel">
      <h2>Story Quality</h2>
      <div id="story-quality"></div>
    </div>
    <div class="panel">
      <h2>Hook Outcomes</h2>
      <div id="hook-outcomes"></div>
    </div>
    <div class="panel">
      <h2>Boredom Analytics</h2>
      <div id="boredom-issues"></div>
    </div>
  </div>

  <div id="tab-balance" class="tab-content">
    <div class="panel">
      <h2>Country Balance</h2>
      <div id="country-balance"></div>
    </div>
    <div class="panel">
      <h2>War Balance</h2>
      <div id="war-balance"></div>
    </div>
    <div class="panel">
      <h2>Power Distribution</h2>
      <canvas id="power-chart" width="1000" height="300"></canvas>
    </div>
  </div>

  <div id="tab-events" class="tab-content">
    <div class="panel">
      <h2>Recent Events</h2>
      <div class="event-feed" id="events"></div>
    </div>
  </div>

  <script>
    const API = '';

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    async function fetchJSON(path, options = {}) {
      const res = await fetch(API + path, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
      });
      if (res.status === 401) { location.reload(); throw new Error('Unauthorized'); }
      if (!res.ok) throw new Error('Request failed: ' + res.status);
      return res.json();
    }

    document.querySelectorAll('.tab').forEach(t => {
      t.onclick = () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        document.getElementById('tab-' + t.dataset.tab).classList.add('active');
      };
    });

    function renderChart(canvasId, labels, datasets) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const W = canvas.width, H = canvas.height;
      const pad = { top: 20, right: 20, bottom: 30, left: 50 };
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(0, 0, W, H);

      let allVals = [];
      for (const ds of datasets) allVals = allVals.concat(ds.data);
      if (allVals.length === 0) return;
      const minV = Math.min(...allVals);
      const maxV = Math.max(...allVals);
      const range = maxV - minV || 1;

      ctx.strokeStyle = '#2a2a3a';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + (H - pad.top - pad.bottom) * (1 - i / 4);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(W - pad.right, y);
        ctx.stroke();
        ctx.fillStyle = '#565f89';
        ctx.font = '10px monospace';
        ctx.fillText((minV + range * i / 4).toFixed(0), 4, y + 3);
      }

      for (const ds of datasets) {
        ctx.strokeStyle = ds.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < ds.data.length; i++) {
          const x = pad.left + (W - pad.left - pad.right) * i / (ds.data.length - 1 || 1);
          const y = pad.top + (H - pad.top - pad.bottom) * (1 - (ds.data[i] - minV) / range);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      ctx.fillStyle = '#565f89';
      ctx.font = '10px sans-serif';
      for (let i = 0; i < labels.length; i += Math.max(1, Math.floor(labels.length / 6))) {
        const x = pad.left + (W - pad.left - pad.right) * i / (labels.length - 1 || 1);
        ctx.fillText(labels[i], x, H - 8);
      }
    }

    async function refresh() {
      const [state, healthData] = await Promise.all([
        fetchJSON('/api/state'),
        fetchJSON('/api/health')
      ]);

      document.getElementById('status').innerHTML = [
        '<span><span class="label">Day:</span> <span class="value">' + state.world.day + '</span></span>',
        '<span><span class="label">Time:</span> <span class="value">' + state.world.time.toFixed(1) + 's</span></span>',
        '<span><span class="label">Speed:</span> <span class="value">' + state.world.speedMultiplier + 'x</span></span>',
        '<span><span class="label">Paused:</span> <span class="value">' + state.world.paused + '</span></span>',
        '<span><span class="label">Events:</span> <span class="value">' + state.stats.totalEvents + '</span></span>',
        healthData && healthData.health ? '<span><span class="label">Health:</span> <span class="value" style="color:' + (healthData.health.overall === 'healthy' ? '#9ece6a' : healthData.health.overall === 'warning' ? '#e0af68' : '#f7768e') + '">' + healthData.health.overall + '</span></span>' : '',
      ].join('');

      document.getElementById('pause-btn').textContent = state.world.paused ? 'Resume' : 'Pause';
      document.getElementById('speed').value = state.world.speedMultiplier;
      document.getElementById('speed-val').textContent = state.world.speedMultiplier + 'x';

      const countries = state.countries.sort((a, b) => b.power - a.power);
      document.getElementById('countries').innerHTML = countries.map(c =>
        '<tr><td>' + escapeHtml(c.name) + '</td><td>' + c.power.toFixed(1) + '</td><td>' + c.gdp.toFixed(0) + '</td><td>' + c.military + '</td><td>' + c.technology.toFixed(1) + '</td><td>' + c.stability.toFixed(1) + '</td><td>' + c.ringTarget + '</td></tr>'
      ).join('');

      document.getElementById('wars').innerHTML = state.wars.length === 0 ? 
        '<tr><td colspan="5" style="color:#565f89">No active wars</td></tr>' :
        state.wars.map(w => {
          const mm = Math.floor(w.duration / 60).toString().padStart(2, '0');
          const ss = (w.duration % 60).toString().padStart(2, '0');
          return '<tr><td>' + escapeHtml(w.attacker.name) + '</td><td>' + escapeHtml(w.defender.name) + '</td><td>' + w.momentum.toFixed(1) + '</td><td>' + w.battles + '</td><td>' + mm + ':' + ss + '</td></tr>';
        }).join('');

      document.getElementById('events').innerHTML = state.recentEvents.slice().reverse().map(e =>
        '<div class="event-item"><span class="day">D' + e.day + '</span><span class="kind">[' + escapeHtml(e.kind) + ']</span><span class="headline">' + escapeHtml(e.headline) + '</span></div>'
      ).join('');

      const selects = [document.getElementById('attacker'), document.getElementById('defender')];
      for (const sel of selects) {
        const current = sel.value;
        sel.innerHTML = countries.map(c => '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + '</option>').join('');
        if (current) sel.value = current;
      }

      if (healthData) {
        if (healthData.health) {
          const m = healthData.health.metrics;
          document.getElementById('overview-metrics').innerHTML = [
            { v: m.fps.toFixed(0), l: 'FPS', c: m.fps >= 50 ? 'good' : m.fps >= 30 ? 'warn' : 'critical' },
            { v: m.tickMs.toFixed(2) + 'ms', l: 'Tick', c: m.tickMs <= 5 ? 'good' : m.tickMs <= 16 ? 'warn' : 'critical' },
            { v: m.activeWars, l: 'Active Wars', c: m.activeWars <= 3 ? 'good' : 'warn' },
            { v: m.activeStories, l: 'Stories', c: 'good' },
            { v: m.memoryMB.toFixed(0) + 'MB', l: 'Memory', c: m.memoryMB <= 100 ? 'good' : 'warn' },
          ].map(x => '<div class="metric-card ' + x.c + '"><div class="value">' + x.v + '</div><div class="label">' + x.l + '</div></div>').join('');

          document.getElementById('health-metrics').innerHTML = [
            { v: m.eventRate.toFixed(2), l: 'Events/s', c: m.eventRate <= 2 ? 'good' : 'warn' },
            { v: m.avgTension.toFixed(1), l: 'Avg Tension', c: m.avgTension <= 70 ? 'good' : 'warn' },
            { v: m.rareEventFrequency, l: 'Rare Events', c: 'good' },
            { v: m.cameraInterruptions, l: 'Camera Interrupts', c: m.cameraInterruptions === 0 ? 'good' : 'warn' },
          ].map(x => '<div class="metric-card ' + x.c + '"><div class="value">' + x.v + '</div><div class="label">' + x.l + '</div></div>').join('');

          document.getElementById('health-checks').innerHTML = healthData.health.checks.map(c =>
            '<div class="health-check"><div class="health-dot ' + escapeHtml(c.status) + '"></div><span>' + escapeHtml(c.message) + '</span></div>'
          ).join('');

          const metrics = m;
          if (typeof renderChart === 'function') {
            renderChart('metrics-chart',
              ['FPS', 'Tick', 'Memory'],
              [
                { data: [metrics.fps], color: '#9ece6a', label: 'FPS' },
                { data: [metrics.tickMs * 10], color: '#e0af68', label: 'Tick x10' },
                { data: [metrics.memoryMB], color: '#f7768e', label: 'Memory' },
              ]
            );
          }
        }

        if (healthData.quality) {
          const q = healthData.quality;
          document.getElementById('story-quality').innerHTML =
            '<div class="metric-grid">' +
            '<div class="metric-card"><div class="value">' + q.averageScore.toFixed(0) + '</div><div class="label">Avg Score</div></div>' +
            Object.entries(q.gradeDistribution).map(([g, n]) =>
              '<div class="metric-card"><div class="value"><span class="grade-badge grade-' + g + '">' + g + '</span> ' + n + '</div><div class="label">Grade ' + g + '</div></div>'
            ).join('') +
            '</div>';
        }

        if (healthData.boredom) {
          const b = healthData.boredom;
          document.getElementById('boredom-issues').innerHTML = b.badLoops.length === 0
            ? '<div style="color:#9ece6a">No boredom issues detected</div>'
            : b.badLoops.map(i => '<div class="alert-item warn">' + escapeHtml(i) + '</div>').join('');
          document.getElementById('hook-outcomes').innerHTML =
            '<div class="metric-grid"><div class="metric-card"><div class="value">' + (b.hookOutcomeRate * 100).toFixed(0) + '%</div><div class="label">Hook → Event Rate</div></div></div>';
        }

        if (healthData.countryBalance) {
          const cb = healthData.countryBalance;
          document.getElementById('country-balance').innerHTML =
            '<div class="metric-grid">' +
            '<div class="metric-card"><div class="value">' + cb.top1Dominance.toFixed(1) + '%</div><div class="label">Top-1 Dominance</div></div>' +
            '<div class="metric-card"><div class="value">' + cb.top3Dominance.toFixed(1) + '%</div><div class="label">Top-3 Dominance</div></div>' +
            '<div class="metric-card"><div class="value">' + cb.giniCoefficient.toFixed(2) + '</div><div class="label">Gini Coefficient</div></div>' +
            '</div>' +
            cb.alerts.map(a => '<div class="alert-item warn">' + escapeHtml(a) + '</div>').join('');
        }

        if (healthData.warBalance) {
          const wb = healthData.warBalance;
          document.getElementById('war-balance').innerHTML =
            '<div class="metric-grid">' +
            '<div class="metric-card"><div class="value">' + wb.activeWars + '</div><div class="label">Active Wars</div></div>' +
            '<div class="metric-card"><div class="value">' + wb.avgWarDuration.toFixed(0) + 's</div><div class="label">Avg Duration</div></div>' +
            '<div class="metric-card"><div class="value">' + wb.warExhaustion.toFixed(0) + '%</div><div class="label">Max Exhaustion</div></div>' +
            '</div>' +
              wb.alerts.map(a => '<div class="alert-item warn">' + escapeHtml(a) + '</div>').join('');
        }

        if (healthData.watchdogAlerts) {
          document.getElementById('watchdog-alerts').innerHTML = healthData.watchdogAlerts.length === 0
            ? '<div style="color:#9ece6a">No watchdog alerts</div>'
            : healthData.watchdogAlerts.map(a =>
              '<div class="alert-item ' + escapeHtml(a.severity) + '"><strong>[' + escapeHtml(a.source) + ']</strong> ' + escapeHtml(a.message) + '</div>'
            ).join('');
        }
      }
    }

    document.getElementById('pause-btn').onclick = async () => {
      await fetchJSON('/api/control/pause', { method: 'POST' });
      refresh();
    };

    document.getElementById('speed').oninput = async (e) => {
      const speed = parseFloat(e.target.value);
      document.getElementById('speed-val').textContent = speed + 'x';
      await fetchJSON('/api/control/speed', { method: 'POST', body: JSON.stringify({ speed }) });
    };

    document.getElementById('war-btn').onclick = async () => {
      const attacker = document.getElementById('attacker').value;
      const defender = document.getElementById('defender').value;
      if (attacker === defender) return alert('Cannot declare war on yourself');
      await fetchJSON('/api/control/war', { method: 'POST', body: JSON.stringify({ attacker, defender }) });
      refresh();
    };

    document.getElementById('snapshot-btn').onclick = async () => {
      const result = await fetchJSON('/api/control/snapshot', { method: 'POST' });
      alert('Snapshot saved: ' + result.path);
    };

    document.getElementById('save-hourly').onclick = async () => {
      const result = await fetchJSON('/api/control/snapshot', { method: 'POST', body: JSON.stringify({ rotation: 'hourly' }) });
      alert('Hourly snapshot: ' + result.path);
    };

    document.getElementById('save-daily').onclick = async () => {
      const result = await fetchJSON('/api/control/snapshot', { method: 'POST', body: JSON.stringify({ rotation: 'daily' }) });
      alert('Daily snapshot: ' + result.path);
    };

    refresh();
    setInterval(refresh, 1000);
  </script>
</body>
</html>`;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }

    if (!url.pathname.startsWith('/api/')) {
      jsonResponse(res, { error: 'Not found' }, 404);
      return;
    }

    if (!checkAuth(req)) {
      jsonResponse(res, { error: 'Unauthorized' }, 401);
      return;
    }

    try {
      if (url.pathname === '/api/state' && req.method === 'GET') {
        jsonResponse(res, buildStateSnapshot());
      } else if (url.pathname === '/api/health' && req.method === 'GET') {
        jsonResponse(res, buildHealthSnapshot());
      } else if (url.pathname === '/api/control/pause' && req.method === 'POST') {
        world.paused = !world.paused;
        jsonResponse(res, { paused: world.paused });
      } else if (url.pathname === '/api/control/speed' && req.method === 'POST') {
        const body = await readBody(req);
        const speed = Math.max(0.25, Math.min(4, Number(body.speed) || 1));
        world.speedMultiplier = speed;
        jsonResponse(res, { speedMultiplier: speed });
      } else if (url.pathname === '/api/control/war' && req.method === 'POST') {
        const body = await readBody(req);
        const attacker = String(body.attacker ?? '');
        const defender = String(body.defender ?? '');
        if (!attacker || !defender) {
          jsonResponse(res, { error: 'attacker and defender required' }, 400);
          return;
        }
        try {
          const war = declareWar(world, attacker, defender, world.rngWar);
          jsonResponse(res, { success: true, warId: war.id });
        } catch (e) {
          jsonResponse(res, { success: false, error: String(e) }, 400);
        }
      } else if (url.pathname === '/api/control/event' && req.method === 'POST') {
        const body = await readBody(req);
        const { tier } = body;
        if (typeof tier !== 'string') {
          jsonResponse(res, { error: 'tier required (common/uncommon/rare/legendary)' }, 400);
          return;
        }
        if (!['common', 'uncommon', 'rare', 'legendary'].includes(tier)) {
          jsonResponse(res, { error: 'invalid tier' }, 400);
          return;
        }
        const ok = spawnStoryEvent(world, tier as StoryTier, world.rngStory);
        jsonResponse(res, { success: ok });
      } else if (url.pathname === '/api/control/snapshot' && req.method === 'POST') {
        const body = await readBody(req);
        const rotation = String(body.rotation ?? 'latest');
        const validRotations = ['latest', 'hourly', 'daily', 'milestone'];
        const rot = validRotations.includes(rotation) ? rotation : 'latest';
        const path = saveSnapshot(world, 'manual', rot as 'latest' | 'hourly' | 'daily' | 'milestone');
        jsonResponse(res, { path });
      } else if (url.pathname === '/api/audience/stats' && req.method === 'GET') {
        const stats = m ? {
          predictions: getPredictionStats(m.predictionStore),
          leaderboard: m.citizenLeaderboard.getGlobalStats(),
          leaderboardTop: m.citizenLeaderboard.getTop(10),
          audienceMetrics: m.audienceAnalytics.collectMetrics(m.citizenLeaderboard, m.predictionStore, m.votingSystem),
        } : null;
        jsonResponse(res, stats);
      } else if (url.pathname === '/api/audience/leaderboard' && req.method === 'GET') {
        const lb = m ? m.citizenLeaderboard.getTop(20) : [];
        jsonResponse(res, { entries: lb, total: m?.citizenLeaderboard.getGlobalStats().totalCitizens ?? 0 });
      } else if (url.pathname === '/api/audience/predictions' && req.method === 'GET') {
        const preds = m ? getActivePredictions(m.predictionStore) : [];
        jsonResponse(res, { predictions: preds.map((p) => ({ id: p.id, title: p.title, options: p.options.map((o) => ({ label: o.label, icon: o.icon, votes: o.votes })), totalVotes: p.totalVotes, status: p.status })) });
      } else if (url.pathname === '/api/content/archive' && req.method === 'GET') {
        const stats = m ? getStoryStats(m.storyArchive) : null;
        const recent = m ? getRecentStories(m.storyArchive, 10).map((s) => ({
          id: s.id, score: s.story.storyScore, title: s.content.shortTitle,
          countries: s.story.actors, day: s.story.endDay, views: s.viewCount,
        })) : [];
        jsonResponse(res, { stats, recent });
      } else if (url.pathname === '/api/content/featured' && req.method === 'GET') {
        const featured = m ? getFeaturedStories(m.storyArchive, 10).map((s) => ({
          id: s.id, score: s.story.storyScore, title: s.content.title,
          hook: s.content.hook, countries: s.story.actors,
        })) : [];
        jsonResponse(res, { featured });
      } else if (url.pathname === '/api/content/queue' && req.method === 'GET') {
        const stats = m ? getQueueStats(m.contentQueue) : null;
        jsonResponse(res, { stats });
      } else if (url.pathname === '/api/content/analytics' && req.method === 'GET') {
        const metrics = m ? collectContentMetrics(m.contentAnalytics, m.storyArchive.stories, m.contentQueue.items, []) : null;
        jsonResponse(res, { metrics });
      } else {
        jsonResponse(res, { error: 'Unknown route' }, 404);
      }
    } catch (err) {
      jsonResponse(res, { error: String(err) }, 500);
    }
  });

  return server;
}
