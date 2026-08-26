import type { WorldState } from '../sim/types';

export interface SimMetrics {
  timestamp: number;
  simTime: number;
  day: number;
  fps: number;
  tickMs: number;
  eventRate: number;
  decisionRate: number;
  activeWars: number;
  activeStories: number;
  avgTension: number;
  avgStability: number;
  avgPower: number;
  allianceCount: number;
  hookFrequency: number;
  rareEventFrequency: number;
  cameraInterruptions: number;
  memoryMB: number;
  countries: number;
  newsCount: number;
}

export interface HealthStatus {
  overall: 'healthy' | 'warning' | 'critical';
  checks: HealthCheck[];
  metrics: SimMetrics;
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  value?: number;
  threshold?: number;
}

interface MetricsHistory {
  entries: SimMetrics[];
  maxEntries: number;
}

export class SimulationHealth {
  private history: MetricsHistory;
  private lastEventCount = 0;
  private lastDecisionCount = 0;
  private lastMetricTime = 0;
  private cameraInterruptions = 0;

  constructor(maxEntries = 3600) {
    this.history = { entries: [], maxEntries };
  }

  recordCameraInterruption(): void {
    this.cameraInterruptions++;
  }

  collectMetrics(w: WorldState, fps: number, tickMs: number): SimMetrics {
    const now = performance.now() / 1000;
    const dt = this.lastMetricTime > 0 ? now - this.lastMetricTime : 1;
    this.lastMetricTime = now;

    const newsCount = w.news.length;
    const eventRate = dt > 0 ? (newsCount - this.lastEventCount) / dt : 0;
    this.lastEventCount = newsCount;

    let activeWars = 0;
    for (const war of w.wars.values()) {
      if (!war.outcome) activeWars++;
    }

    let activeStories = w.story.chains.length + w.story.mysteries.length;

    let totalTension = 0;
    let totalStability = 0;
    let totalPower = 0;
    let relCount = 0;
    for (const rel of w.relations.values()) {
      totalTension += rel.tension;
      relCount++;
    }
    for (const c of w.countries) {
      totalStability += c.stability;
      totalPower += c.power;
    }
    const avgTension = relCount > 0 ? totalTension / relCount : 0;
    const avgStability = w.countries.length > 0 ? totalStability / w.countries.length : 0;
    const avgPower = w.countries.length > 0 ? totalPower / w.countries.length : 0;

    const rareEvents = w.news.filter(
      (e) => e.spectacle && (e.spectacle.tier === 'rare' || e.spectacle.tier === 'legendary')
    ).length;

    const hookEvents = w.news.filter(
      (e) => e.kind === 'border-dispute' && e.headline.includes('UNUSUAL')
    ).length;

    let memoryMB = 0;
    if (typeof globalThis.process !== 'undefined') {
      try {
        memoryMB = globalThis.process.memoryUsage().heapUsed / 1048576;
      } catch { /* browser */ }
    }

    const metrics: SimMetrics = {
      timestamp: now,
      simTime: w.time,
      day: w.day,
      fps,
      tickMs,
      eventRate,
      decisionRate: 0,
      activeWars,
      activeStories,
      avgTension,
      avgStability,
      avgPower,
      allianceCount: 0,
      hookFrequency: hookEvents,
      rareEventFrequency: rareEvents,
      cameraInterruptions: this.cameraInterruptions,
      memoryMB,
      countries: w.countries.length,
      newsCount,
    };

    this.history.entries.push(metrics);
    if (this.history.entries.length > this.history.maxEntries) {
      this.history.entries.shift();
    }

    return metrics;
  }

  getHistory(): SimMetrics[] {
    return this.history.entries;
  }

  getLatest(): SimMetrics | null {
    return this.history.entries.length > 0
      ? this.history.entries[this.history.entries.length - 1]
      : null;
  }

  getAverageOver(windowSec: number, field: keyof SimMetrics): number {
    const cutoff = performance.now() / 1000 - windowSec;
    const relevant = this.history.entries.filter(
      (e) => e.timestamp >= cutoff && typeof e[field] === 'number'
    );
    if (relevant.length === 0) return 0;
    const sum = relevant.reduce((s, e) => s + (e[field] as number), 0);
    return sum / relevant.length;
  }

  checkHealth(w: WorldState): HealthStatus {
    const latest = this.getLatest();
    if (!latest) {
      return { overall: 'healthy', checks: [], metrics: this.collectMetrics(w, 60, 0) };
    }

    const checks: HealthCheck[] = [];

    checks.push({
      name: 'FPS',
      status: latest.fps >= 50 ? 'pass' : latest.fps >= 30 ? 'warn' : 'fail',
      message: `FPS: ${latest.fps.toFixed(0)}`,
      value: latest.fps,
      threshold: 50,
    });

    checks.push({
      name: 'Tick Duration',
      status: latest.tickMs <= 5 ? 'pass' : latest.tickMs <= 16 ? 'warn' : 'fail',
      message: `Tick: ${latest.tickMs.toFixed(2)}ms`,
      value: latest.tickMs,
      threshold: 5,
    });

    checks.push({
      name: 'Event Rate',
      status: latest.eventRate <= 2 ? 'pass' : latest.eventRate <= 5 ? 'warn' : 'fail',
      message: `Events/s: ${latest.eventRate.toFixed(2)}`,
      value: latest.eventRate,
      threshold: 2,
    });

    checks.push({
      name: 'Memory',
      status: latest.memoryMB <= 100 ? 'pass' : latest.memoryMB <= 200 ? 'warn' : 'fail',
      message: `Memory: ${latest.memoryMB.toFixed(1)}MB`,
      value: latest.memoryMB,
      threshold: 100,
    });

    checks.push({
      name: 'Active Wars',
      status: latest.activeWars <= 3 ? 'pass' : latest.activeWars <= 5 ? 'warn' : 'fail',
      message: `Wars: ${latest.activeWars}`,
      value: latest.activeWars,
      threshold: 3,
    });

    checks.push({
      name: 'Tension',
      status: latest.avgTension <= 70 ? 'pass' : latest.avgTension <= 85 ? 'warn' : 'fail',
      message: `Avg tension: ${latest.avgTension.toFixed(1)}`,
      value: latest.avgTension,
      threshold: 70,
    });

    const fails = checks.filter((c) => c.status === 'fail').length;
    const warns = checks.filter((c) => c.status === 'warn').length;
    const overall = fails > 0 ? 'critical' : warns > 0 ? 'warning' : 'healthy';

    return { overall, checks, metrics: latest };
  }

  reset(): void {
    this.history.entries = [];
    this.lastEventCount = 0;
    this.lastDecisionCount = 0;
    this.lastMetricTime = 0;
    this.cameraInterruptions = 0;
  }
}
