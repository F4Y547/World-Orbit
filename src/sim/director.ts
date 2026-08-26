import type { Rng } from '../core/rng';
import type {
  CountryRuntime,
  Relation,
  Situation,
  SituationPhase,
  StoryDirectorState,
  War,
  WorldState,
} from './types';
import { tensionLevel } from './types';
import { pairKey } from './diplomacy';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function createDirectorState(): StoryDirectorState {
  return {
    situations: [],
    nextSituationId: 1,
    lastDirectorTick: 0,
    focusSituationId: null,
  };
}

export function directorTick(w: WorldState, dtSec: number): void {
  const D = w.director;
  D.lastDirectorTick += dtSec;

  for (const sit of D.situations) {
    updateSituation(sit, w);
  }

  D.situations = D.situations.filter((s) => s.phase !== 'consequences' || w.time - s.lastPhaseChange < 120);

  detectSituations(w);

  const focus = findMostInteresting(w);
  D.focusSituationId = focus?.id ?? null;
}

function detectSituations(w: WorldState): void {
  const D = w.director;

  for (const war of w.wars.values()) {
    if (war.outcome) continue;
    const existing = D.situations.find(
      (s) => s.actors.includes(war.attackerId) && s.actors.includes(war.defenderId) && s.phase !== 'consequences',
    );
    if (!existing) {
      const sit: Situation = {
        id: D.nextSituationId++,
        label: `${w.byId.get(war.attackerId)?.def.name ?? '?'} vs ${w.byId.get(war.defenderId)?.def.name ?? '?'}`,
        actors: [war.attackerId, war.defenderId],
        phase: 'escalation',
        tension: Math.min(100, 50 + Math.abs(war.momentum) * 0.5),
        interest: 50,
        escalation: Math.min(1, Math.abs(war.momentum) / 72),
        startTime: w.time,
        lastPhaseChange: w.time,
        events: [],
      };
      D.situations.push(sit);
    }
  }

  for (const rel of w.relations.values()) {
    if (rel.tension < 60) continue;
    if (rel.a === rel.b) continue;
    const existing = D.situations.find(
      (s) => s.actors.includes(rel.a) && s.actors.includes(rel.b) && s.phase !== 'consequences',
    );
    if (existing) continue;

    const level = tensionLevel(rel.tension);
    let phase: SituationPhase = 'created';
    if (level === 'crisis') phase = 'escalation';
    else if (level === 'imminent') phase = 'reveal';
    else if (level === 'collision') phase = 'resolution';
    else if (level === 'buildup') phase = 'anticipation';

    const sit: Situation = {
      id: D.nextSituationId++,
      label: `${w.byId.get(rel.a)?.def.name ?? '?'}-${w.byId.get(rel.b)?.def.name ?? '?'} tensions`,
      actors: [rel.a, rel.b],
      phase,
      tension: rel.tension,
      interest: 0,
      escalation: rel.tension / 100,
      startTime: w.time,
      lastPhaseChange: w.time,
      events: [],
    };
    D.situations.push(sit);
  }
}

function updateSituation(sit: Situation, w: WorldState): void {
  const D = w.director;
  const elapsed = w.time - sit.startTime;
  const oldPhase = sit.phase;

  const activeWar = findActiveWarBetween(sit.actors, w);
  if (activeWar) {
    sit.tension = Math.min(100, 50 + Math.abs(activeWar.momentum) * 0.5);
    sit.escalation = Math.min(1, Math.abs(activeWar.momentum) / 72);
    if (sit.phase === 'created') sit.phase = 'anticipation';
    if (sit.phase === 'anticipation' && elapsed > 10) sit.phase = 'escalation';
    if (sit.phase === 'escalation' && Math.abs(activeWar.momentum) > 30) sit.phase = 'reveal';
  } else {
    const avgTension = averageTension(sit.actors, w);
    sit.tension = avgTension;
    sit.escalation = avgTension / 100;
  }

  if (sit.phase === 'created' && elapsed > 20) sit.phase = 'anticipation';
  if (sit.phase === 'anticipation' && sit.tension > 70) sit.phase = 'escalation';
  if (sit.phase === 'escalation' && sit.tension > 85) sit.phase = 'reveal';
  if (sit.phase === 'reveal' && sit.tension > 95) sit.phase = 'resolution';
  if (sit.phase === 'resolution' && elapsed > 60) sit.phase = 'consequences';

  if (sit.phase !== oldPhase) {
    sit.lastPhaseChange = w.time;
  }

  const powerScore = sit.actors.reduce((sum, id) => {
    const c = w.byId.get(id);
    return sum + (c?.power ?? 0);
  }, 0) / Math.max(1, sit.actors.length);

  const recentEvents = w.news.filter(
    (e) => sit.actors.includes(e.actorA) && sit.actors.includes(e.actorB) && w.time - e.time < 120,
  ).length;

  sit.interest = clamp(
    sit.tension * 0.35 +
    sit.escalation * 25 +
    powerScore * 0.2 +
    recentEvents * 3 +
    (sit.phase === 'reveal' ? 15 : 0) +
    (sit.phase === 'resolution' ? 20 : 0),
    0, 100,
  );
}

function findMostInteresting(w: WorldState): Situation | null {
  const D = w.director;
  let best: Situation | null = null;
  let bestScore = -1;
  for (const sit of D.situations) {
    if (sit.phase === 'consequences') continue;
    const score = sit.interest + (sit.id === D.focusSituationId ? 5 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = sit;
    }
  }
  return best;
}

function findActiveWarBetween(actors: string[], w: WorldState): War | null {
  for (const war of w.wars.values()) {
    if (war.outcome) continue;
    if (actors.includes(war.attackerId) && actors.includes(war.defenderId)) return war;
  }
  return null;
}

function averageTension(actors: string[], w: WorldState): number {
  let sum = 0;
  let count = 0;
  for (const rel of w.relations.values()) {
    if (actors.includes(rel.a) && actors.includes(rel.b)) {
      sum += rel.tension;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

export function getDirectorSituation(w: WorldState): Situation | null {
  const id = w.director.focusSituationId;
  if (id === null) return null;
  return w.director.situations.find((s) => s.id === id) ?? null;
}

export function getSituationForCountry(w: WorldState, countryId: string): Situation | null {
  const D = w.director;
  let best: Situation | null = null;
  let bestScore = 0;
  for (const sit of D.situations) {
    if (sit.phase === 'consequences') continue;
    if (!sit.actors.includes(countryId)) continue;
    if (sit.interest > bestScore) {
      bestScore = sit.interest;
      best = sit;
    }
  }
  return best;
}
