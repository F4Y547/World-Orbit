import { mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { WorldState } from '../sim/types';
import { createWorld } from '../sim/world';
import { recalcPower } from '../sim/countryState';
import { pairKey } from '../sim/diplomacy';

const BASE_DIR = join(process.env.HOME ?? '/tmp', '.world-orbit', 'snapshots');
const LATEST_FILE = join(BASE_DIR, 'latest.json');
const HOURLY_DIR = join(BASE_DIR, 'hourly');
const DAILY_DIR = join(BASE_DIR, 'daily');
const MILESTONE_DIR = join(BASE_DIR, 'milestones');

export interface SnapshotMeta {
  version: number;
  timestamp: number;
  checksum: string;
  label: string;
  day: number;
  simTime: number;
}

export interface SnapshotData {
  meta: SnapshotMeta;
  world: ReturnType<typeof serializeWorld>;
}

function ensureDirs(): void {
  mkdirSync(BASE_DIR, { recursive: true });
  mkdirSync(HOURLY_DIR, { recursive: true });
  mkdirSync(DAILY_DIR, { recursive: true });
  mkdirSync(MILESTONE_DIR, { recursive: true });
}

function serializeWorld(w: WorldState) {
  return {
    seed: w.seed,
    time: w.time,
    day: w.day,
    paused: w.paused,
    speedMultiplier: w.speedMultiplier,
    countries: w.countries.map((c) => ({
      id: c.def.id, gdp: c.gdp, wealth: c.wealth, debt: c.debt,
      economy: c.economy, military: c.military, technology: c.technology,
      industry: c.industry, stability: c.stability, morale: c.morale,
      publicSupport: c.publicSupport, influence: c.influence, reputation: c.reputation,
      population: c.population, resourcesScore: c.resourcesScore,
      power: c.power, prevPower: c.prevPower, ringTarget: c.ringTarget,
      lastRingChange: c.lastRingChange, growthSmoothed: c.growthSmoothed,
      warId: c.warId, exhaustion: c.exhaustion, defeatUntil: c.defeatUntil,
    })),
    relations: Array.from(w.relations.values()),
    news: w.news,
    nextEventId: w.nextEventId,
    wars: Array.from(w.wars.values()),
    nextWarId: w.nextWarId,
    truces: Array.from(w.truces.entries()),
    lastWarEnd: w.lastWarEnd,
    story: w.story,
    director: w.director,
  };
}

function deserializeWorld(data: ReturnType<typeof serializeWorld>): WorldState {
  const w = createWorld(data.seed);
  w.time = data.time;
  w.day = data.day;
  w.paused = data.paused;
  w.speedMultiplier = data.speedMultiplier;
  w.nextEventId = data.nextEventId;
  w.nextWarId = data.nextWarId;
  w.lastWarEnd = data.lastWarEnd;

  for (const cData of data.countries) {
    const c = w.byId.get(cData.id);
    if (!c) continue;
    Object.assign(c, cData);
  }

  w.relations.clear();
  for (const r of data.relations) {
    const raw = r as unknown as Record<string, unknown>;
    const rel = {
      a: r.a, b: r.b, score: r.score, tension: r.tension,
      trust: Number(raw.trust) || 30,
      tradeVolume: Number(raw.tradeVolume) || 20,
      militaryPressure: Number(raw.militaryPressure) || 10,
      lastEventTime: Number(raw.lastEventTime) || 0,
      eventMemory: Array.isArray(raw.eventMemory) ? raw.eventMemory : [],
    };
    w.relations.set(pairKey(r.a, r.b), rel);
  }

  w.news = data.news as WorldState['news'];
  w.wars.clear();
  for (const war of data.wars) {
    w.wars.set(war.id, war as WorldState['wars'] extends Map<number, infer V> ? V : never);
  }
  w.truces.clear();
  for (const [k, v] of data.truces) w.truces.set(k, v);

  w.story = data.story;
  if (!w.story.boredom) {
    w.story.boredom = {
      recentKinds: [], tensionAccumulator: 0, hookActive: false,
      hookType: null, hookStartTime: 0, hookLevel: 0, lastHookTime: -1e9,
    };
  }
  w.director = data.director ?? { situations: [], nextSituationId: 1, lastDirectorTick: 0, focusSituationId: null };

  recalcPower(w);
  return w;
}

function computeChecksum(data: unknown): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16);
}

export function saveSnapshot(w: WorldState, label: string, rotation: 'latest' | 'hourly' | 'daily' | 'milestone' = 'latest'): string {
  ensureDirs();
  const serialized = serializeWorld(w);
  const meta: SnapshotMeta = {
    version: 1,
    timestamp: Date.now(),
    checksum: computeChecksum(serialized),
    label,
    day: w.day,
    simTime: w.time,
  };
  const snapshot: SnapshotData = { meta, world: serialized };
  const json = JSON.stringify(snapshot);

  let filePath: string;
  if (rotation === 'latest') {
    filePath = LATEST_FILE;
  } else {
    const dir = rotation === 'hourly' ? HOURLY_DIR : rotation === 'daily' ? DAILY_DIR : MILESTONE_DIR;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    filePath = join(dir, `${label}-${ts}.json`);
  }

  writeFileSync(filePath, json, 'utf-8');

  if (rotation === 'hourly') pruneOldFiles(HOURLY_DIR, 48);
  if (rotation === 'daily') pruneOldFiles(DAILY_DIR, 30);

  return filePath;
}

export function loadLatest(): WorldState | null {
  if (!existsSync(LATEST_FILE)) return null;
  try {
    const raw = readFileSync(LATEST_FILE, 'utf-8');
    const snapshot: SnapshotData = JSON.parse(raw);
    const checksum = computeChecksum(snapshot.world);
    if (checksum !== snapshot.meta.checksum) {
      console.error('Snapshot checksum mismatch!');
      return null;
    }
    return deserializeWorld(snapshot.world);
  } catch (e) {
    console.error('Failed to load snapshot:', e);
    return null;
  }
}

export function rollback(label?: string): WorldState | null {
  ensureDirs();
  if (label) {
    const files = readdirSync(HOURLY_DIR)
      .filter((f) => f.includes(label))
      .sort()
      .reverse();
    if (files.length > 0) {
      const raw = readFileSync(join(HOURLY_DIR, files[0]), 'utf-8');
      const snapshot: SnapshotData = JSON.parse(raw);
      return deserializeWorld(snapshot.world);
    }
  }
  return loadLatest();
}

export function verifySnapshot(filePath: string): { valid: boolean; error?: string } {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const snapshot: SnapshotData = JSON.parse(raw);
    if (!snapshot.meta || !snapshot.meta.checksum) {
      return { valid: false, error: 'Missing metadata' };
    }
    const checksum = computeChecksum(snapshot.world);
    if (checksum !== snapshot.meta.checksum) {
      return { valid: false, error: 'Checksum mismatch' };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, error: String(e) };
  }
}

function pruneOldFiles(dir: string, maxFiles: number): void {
  const files = readdirSync(dir).sort();
  while (files.length > maxFiles) {
    const old = files.shift()!;
    unlinkSync(join(dir, old));
  }
}

export function listSnapshots(): SnapshotMeta[] {
  ensureDirs();
  const results: SnapshotMeta[] = [];
  for (const dir of [HOURLY_DIR, DAILY_DIR, MILESTONE_DIR]) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      try {
        const raw = readFileSync(join(dir, file), 'utf-8');
        const snapshot: SnapshotData = JSON.parse(raw);
        if (snapshot.meta) results.push(snapshot.meta);
      } catch { /* skip corrupt */ }
    }
  }
  return results.sort((a, b) => b.timestamp - a.timestamp);
}
