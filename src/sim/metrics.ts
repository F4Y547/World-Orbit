import type { WorldState } from './types';

export interface SoakMetrics {
  timestamp: number;
  simTime: number;
  day: number;
  countries: Array<{
    id: string;
    power: number;
    gdp: number;
    military: number;
    stability: number;
    morale: number;
  }>;
  activeWars: number;
  totalEvents: number;
  relations: {
    hostile: number;
    competitive: number;
    neutral: number;
    friendly: number;
  };
  perf: {
    avgTickMs: number;
    maxTickMs: number;
    memoryMB: number;
  };
  story: {
    activeChains: number;
    activeMysteries: number;
    boredomHookLevel: number;
  };
}

export interface HourlySnapshot {
  hour: number;
  metrics: SoakMetrics;
  deltas: SoakDeltas;
}

export interface SoakDeltas {
  gdpChange: number;
  powerShift: number;
  newEvents: number;
  storyEvents: number;
  warStarts: number;
  warEnds: number;
  moraleChange: number;
}

export function collectMetrics(w: WorldState): SoakMetrics {
  let memoryMB = 0;
  if (typeof globalThis.process !== 'undefined') {
    try {
      memoryMB = globalThis.process.memoryUsage().heapUsed / 1048576;
    } catch { /* browser */ }
  }

  let activeWars = 0;
  for (const war of w.wars.values()) {
    if (!war.outcome) activeWars++;
  }

  const relations = { hostile: 0, competitive: 0, neutral: 0, friendly: 0 };
  for (const rel of w.relations.values()) {
    if (rel.score <= -55) relations.hostile++;
    else if (rel.score <= -18) relations.competitive++;
    else if (rel.score < 25) relations.neutral++;
    else relations.friendly++;
  }

  return {
    timestamp: performance.now() / 1000,
    simTime: w.time,
    day: w.day,
    countries: w.countries.map((c) => ({
      id: c.def.id,
      power: c.power,
      gdp: c.gdp,
      military: c.military,
      stability: c.stability,
      morale: c.morale,
    })),
    activeWars,
    totalEvents: w.news.length,
    relations,
    perf: {
      avgTickMs: w.perf.avgTickMs,
      maxTickMs: w.perf.maxTickMs,
      memoryMB,
    },
    story: {
      activeChains: w.story.chains.length,
      activeMysteries: w.story.mysteries.length,
      boredomHookLevel: w.story.boredom.hookLevel,
    },
  };
}

export function computeDeltas(prev: SoakMetrics, curr: SoakMetrics): SoakDeltas {
  const prevGdp = prev.countries.reduce((s, c) => s + c.gdp, 0);
  const currGdp = curr.countries.reduce((s, c) => s + c.gdp, 0);

  let maxPowerShift = 0;
  for (const cc of curr.countries) {
    const pc = prev.countries.find((p) => p.id === cc.id);
    if (pc) maxPowerShift = Math.max(maxPowerShift, Math.abs(cc.power - pc.power));
  }

  const prevMorale = prev.countries.reduce((s, c) => s + c.morale, 0) / Math.max(1, prev.countries.length);
  const currMorale = curr.countries.reduce((s, c) => s + c.morale, 0) / Math.max(1, curr.countries.length);

  return {
    gdpChange: currGdp - prevGdp,
    powerShift: maxPowerShift,
    newEvents: curr.totalEvents - prev.totalEvents,
    storyEvents: 0,
    warStarts: Math.max(0, curr.activeWars - prev.activeWars),
    warEnds: Math.max(0, prev.activeWars - curr.activeWars),
    moraleChange: currMorale - prevMorale,
  };
}
