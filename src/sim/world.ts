import { CONFIG } from '../config';
import { mulberry32 } from '../core/rng';
import { COUNTRIES } from './countries';
import { createRuntimes, econTick, recalcPower } from './countryState';
import { diploTick, initRelations, pairKey } from './diplomacy';
import { createBodies, stepOrbits } from './orbitSystem';
import type { EventKind, MonitoringState, WorldState } from './types';
import { activeWarPairs, checkPeace, maybeDeclareWar, resolveBattles } from './war';
import { antiBoringCheck, createStoryState, markBigMoment, storyTick } from './story';
import { createDirectorState, directorTick } from './director';
import { decideAction, executeDecision } from './decision';

const AMBIENT_KINDS = new Set<EventKind>([
  'trade-deal',
  'trade-mission',
  'cultural-exchange',
  'joint-exercise',
  'treaty',
  'sanctions',
  'border-dispute',
  'failed-talks',
  'rhetoric',
  'summit',
]);

export function createWorld(seed: number): WorldState {
  const bodiesRng = mulberry32(seed);
  const persRng = mulberry32(seed ^ 0x5f356495);
  const relRng = mulberry32(seed ^ 0x1b873593);

  const countries = createRuntimes(COUNTRIES, persRng);
  const byId = new Map(countries.map((c) => [c.def.id, c]));

  const world: WorldState = {
    seed,
    time: 0,
    day: 1,
    paused: false,
    speedMultiplier: 1,
    bodies: createBodies(COUNTRIES, bodiesRng),
    countries,
    byId,
    relations: new Map(),
    news: [],
    nextEventId: 1,
    wars: new Map(),
    nextWarId: 1,
    truces: new Map(),
    lastWarEnd: -CONFIG.war.droughtStartSec,
    econAcc: 0,
    diploAcc: 0,
    powerAcc: 0,
    warAcc: 0,
    battleAcc: 0,
    rngDiplo: mulberry32(seed ^ 0x9e3779b9),
    rngEcon: mulberry32(seed ^ 0x2545f491),
    rngWar: mulberry32(seed ^ 0x85ebca6b),
    rngStory: mulberry32(seed ^ 0x27d4eb2f),
    story: createStoryState(),
    director: createDirectorState(),
    monitoring: {
      lastHealthCheck: 0,
      lastSnapshotHourly: 0,
      lastSnapshotDaily: 0,
      watchdogAlerts: [],
    },
    audience: {
      activePredictionId: null,
      activeVoteId: null,
      lastPredictionTime: -1000,
      lastVoteTime: -1000,
      lastPredictionEventKind: null,
      viewerCount: 0,
      totalPredictionsAllTime: 0,
      totalVotesAllTime: 0,
    },
    content: {
      activeStoryId: null,
      lastRecordingStartTime: -1000,
      lastHighlightScore: 0,
      totalStoriesRecorded: 0,
      totalHighlightsDetected: 0,
    },
    perf: {
      tickCount: 0,
      lastTickTime: Date.now(),
      avgTickMs: 0,
      maxTickMs: 0,
      memoryUsage: { heapUsed: 0, heapTotal: 0, rss: 0 },
    },
  };

  initRelations(world, relRng);
  recalcPower(world);
  for (const c of world.countries) c.ringTarget = c.def.tier;

  return world;
}

function updateMovementStates(w: WorldState): void {
  const atWar = new Set<string>();
  for (const war of w.wars.values()) {
    if (war.outcome) continue;
    atWar.add(war.attackerId);
    atWar.add(war.defenderId);
  }
  const maxTension = new Map<string, number>();
  for (const rel of w.relations.values()) {
    if (rel.tension > (maxTension.get(rel.a) ?? 0)) maxTension.set(rel.a, rel.tension);
    if (rel.tension > (maxTension.get(rel.b) ?? 0)) maxTension.set(rel.b, rel.tension);
  }

  for (const b of w.bodies) {
    if (atWar.has(b.def.id)) b.state = 'war';
    else if (w.time < w.byId.get(b.def.id)!.defeatUntil) b.state = 'defeat';
    else {
      const t = maxTension.get(b.def.id) ?? 0;
      b.state = t >= 80 ? 'crisis' : t >= 55 ? 'tension' : 'normal';
    }
  }
}

export function stepWorld(w: WorldState, dt: number): void {
  const tickStart = Date.now();
  if (w.paused) return;
  const scaledDt = dt * w.speedMultiplier;
  w.time += scaledDt;
  const newsBefore = w.news.length;

  w.econAcc += scaledDt;
  while (w.econAcc >= CONFIG.econIntervalSec) {
    w.econAcc -= CONFIG.econIntervalSec;
    econTick(w, CONFIG.econIntervalSec, w.rngEcon);
  }

  w.diploAcc += scaledDt;
  while (w.diploAcc >= CONFIG.diploIntervalSec) {
    w.diploAcc -= CONFIG.diploIntervalSec;
    diploTick(w, w.rngDiplo, CONFIG.diploIntervalSec, 1);
  }

  w.powerAcc += scaledDt;
  while (w.powerAcc >= CONFIG.powerIntervalSec) {
    w.powerAcc -= CONFIG.powerIntervalSec;
    recalcPower(w);
  }

  w.warAcc += scaledDt;
  while (w.warAcc >= CONFIG.war.checkIntervalSec) {
    w.warAcc -= CONFIG.war.checkIntervalSec;
    maybeDeclareWar(w, w.rngWar);
    checkPeace(w, w.rngWar);
  }

  w.battleAcc += scaledDt;
  while (w.battleAcc >= CONFIG.war.battleIntervalSec) {
    w.battleAcc -= CONFIG.war.battleIntervalSec;
    resolveBattles(w, w.rngWar);
    checkPeace(w, w.rngWar);
  }

  for (const b of w.bodies) {
    b.tierTarget = w.byId.get(b.def.id)!.ringTarget;
  }

  updateMovementStates(w);

  storyTick(w, w.rngStory);
  antiBoringCheck(w, w.rngStory);

  directorTick(w, scaledDt);

  if (w.perf.tickCount % 60 === 0) {
    for (const country of w.countries) {
      if (country.warId !== null) continue;
      const ctx = { self: country, relations: w.relations, wars: [...w.wars.values()], world: w, rng: mulberry32(w.seed ^ (w.perf.tickCount + country.def.power)) };
      const actions = decideAction(ctx);
      if (actions.length > 0 && actions[0].score > 15) {
        executeDecision(ctx, actions[0]);
      }
    }
  }

  const active = activeWarPairs(w);
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < w.bodies.length; i++) {
    for (let j = i + 1; j < w.bodies.length; j++) {
      if (active.has(pairKey(w.bodies[i].def.id, w.bodies[j].def.id))) pairs.push([i, j]);
    }
  }
  stepOrbits(w.bodies, scaledDt, w.time, pairs);

  for (let i = newsBefore; i < w.news.length; i++) {
    if (!AMBIENT_KINDS.has(w.news[i].kind)) {
      markBigMoment(w);
      break;
    }
  }

  w.day = Math.floor(w.time / CONFIG.dayLengthSec) + 1;

  if (w.perf.tickCount % 600 === 0) {
    cleanupOldWars(w);
  }

  const tickMs = Date.now() - tickStart;
  w.perf.tickCount++;
  w.perf.avgTickMs = (w.perf.avgTickMs * (w.perf.tickCount - 1) + tickMs) / w.perf.tickCount;
  w.perf.maxTickMs = Math.max(w.perf.maxTickMs, tickMs);
  if (w.perf.tickCount % 1000 === 0) {
    w.perf.memoryUsage = { heapUsed: 0, heapTotal: 0, rss: 0 };
    if (typeof globalThis.process !== 'undefined') {
      try {
        w.perf.memoryUsage = globalThis.process.memoryUsage();
      } catch {
        // Browser environment - no process.memoryUsage
      }
    }
  }
}

const WAR_HISTORY_KEEP_SEC = 600;

function cleanupOldWars(w: WorldState): void {
  const cutoff = w.time - WAR_HISTORY_KEEP_SEC;
  for (const [id, war] of w.wars) {
    if (war.outcome && war.startTime < cutoff) {
      w.wars.delete(id);
    }
  }
}
