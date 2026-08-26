import { CONFIG } from '../config';
import type { Rng } from '../core/rng';
import type { EventKind, Relation, SimEvent, WorldState, EventMemory } from './types';
import { tensionLevel } from './types';
import { activeWarPairs } from './war';

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function flagEmoji(code: string): string {
  return String.fromCodePoint(
    ...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 97),
  );
}

interface EventTemplate {
  kind: EventKind;
  delta: number;
  trustDelta: number;
  tradeDelta: number;
  milPressureDelta: number;
  label: string;
}

const HOSTILE: EventTemplate[] = [
  { kind: 'border-dispute', delta: -12, trustDelta: -8, tradeDelta: -3, milPressureDelta: 10, label: 'BORDER DISPUTE' },
  { kind: 'sanctions', delta: -9, trustDelta: -12, tradeDelta: -15, milPressureDelta: 5, label: 'IMPOSES SANCTIONS ON' },
  { kind: 'failed-talks', delta: -6, trustDelta: -5, tradeDelta: 0, milPressureDelta: 3, label: 'TALKS COLLAPSE WITH' },
  { kind: 'rhetoric', delta: -3, trustDelta: -2, tradeDelta: 0, milPressureDelta: 5, label: 'ISSUES WARNING TO' },
];

const COMPETITIVE: EventTemplate[] = [
  { kind: 'rhetoric', delta: -4, trustDelta: -3, tradeDelta: 0, milPressureDelta: 4, label: 'RAISES TENSIONS WITH' },
  { kind: 'sanctions', delta: -7, trustDelta: -8, tradeDelta: -10, milPressureDelta: 3, label: 'THREATENS SANCTIONS ON' },
  { kind: 'failed-talks', delta: -4, trustDelta: -4, tradeDelta: 0, milPressureDelta: 2, label: 'DELEGATION WALKS OUT ON' },
];

const NEUTRAL: EventTemplate[] = [
  { kind: 'trade-mission', delta: 5, trustDelta: 2, tradeDelta: 8, milPressureDelta: -1, label: 'SENDS TRADE MISSION TO' },
  { kind: 'cultural-exchange', delta: 4, trustDelta: 3, tradeDelta: 0, milPressureDelta: -1, label: 'OPENS CULTURAL EXCHANGE WITH' },
  { kind: 'summit', delta: 6, trustDelta: 4, tradeDelta: 2, milPressureDelta: -2, label: 'HOSTS SUMMIT WITH' },
  { kind: 'rhetoric', delta: -3, trustDelta: -1, tradeDelta: 0, milPressureDelta: 1, label: 'CRITICIZES' },
];

const FRIENDLY: EventTemplate[] = [
  { kind: 'trade-deal', delta: 8, trustDelta: 5, tradeDelta: 12, milPressureDelta: -2, label: 'SIGNS TRADE DEAL WITH' },
  { kind: 'treaty', delta: 10, trustDelta: 8, tradeDelta: 3, milPressureDelta: -5, label: 'SIGNS TREATY WITH' },
  { kind: 'joint-exercise', delta: 6, trustDelta: 3, tradeDelta: 0, milPressureDelta: 3, label: 'HOLDS JOINT EXERCISES WITH' },
  { kind: 'cultural-exchange', delta: 4, trustDelta: 4, tradeDelta: 2, milPressureDelta: -1, label: 'EXPANDS TIES WITH' },
];

function templatesFor(score: number): EventTemplate[] {
  if (score < -40) return HOSTILE;
  if (score < -12) return COMPETITIVE;
  if (score < 25) return NEUTRAL;
  return FRIENDLY;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function initRelations(w: WorldState, rng: Rng): void {
  const n = w.countries.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const A = w.countries[i];
      const B = w.countries[j];
      let base = 0;
      if (A.ringTarget === B.ringTarget) {
        base -= 10 + rng() * 10;
      } else {
        const gap = Math.abs(A.def.power - B.def.power);
        base += gap > 25 ? -(4 + rng() * 8) : rng() * 20 - 2;
      }
      for (const c of [A, B]) {
        if (c.p.type === 'diplomatic') base += 10;
        else if (c.p.type === 'aggressive') base -= 5;
        else if (c.p.type === 'unpredictable') base += rng() * 24 - 12;
      }
      if (A.ringTarget === 0 && B.ringTarget === 0) base -= 18 + rng() * 12;
      const score = clamp(base, -60, 45);
      const rel: Relation = {
        a: A.def.id,
        b: B.def.id,
        score,
        tension: score < 0 ? -score * 0.5 : 0,
        trust: clamp(30 + score * 0.4 + rng() * 10, 0, 100),
        tradeVolume: clamp(20 + (score + 60) * 0.3 + rng() * 15, 0, 100),
        militaryPressure: clamp(10 + (-score) * 0.3 + rng() * 8, 0, 100),
        lastEventTime: 0,
        eventMemory: [],
      };
      w.relations.set(pairKey(rel.a, rel.b), rel);
    }
  }
}

export function diploTick(w: WorldState, rng: Rng, dtSec: number, tickFrac: number): void {
  const D = CONFIG.diplomacy;
  const atWar = activeWarPairs(w);

  for (const [key, rel] of w.relations) {
    if (atWar.has(key)) {
      rel.score = -100;
      rel.tension = 100;
      rel.trust = 0;
      rel.militaryPressure = 100;
      continue;
    }
    const A = w.byId.get(rel.a)!;
    const B = w.byId.get(rel.b)!;

    let drift = -Math.sign(rel.score) * D.decayToNeutral;
    drift -= (A.p.aggression + B.p.aggression) * D.personalityAggDrift * 0.5;
    if (A.p.type === 'diplomatic') drift += D.diplomaticWarmth;
    if (B.p.type === 'diplomatic') drift += D.diplomaticWarmth;

    const strong = A.power >= B.power ? A : B;
    const weak = strong === A ? B : A;
    if (
      strong.power - weak.power > D.hegemonyMinGap &&
      strong.influence > D.hegemonyMinInfluence
    ) {
      drift += ((strong.influence - D.hegemonyMinInfluence) / 40) * D.hegemonyPull;
    }

    drift += (rng() * 2 - 1) * D.noiseAmp * dtSec / CONFIG.diploIntervalSec;
    rel.score = clamp(rel.score + drift, -100, 100);

    if (rel.score < 0) {
      rel.tension += (-rel.score * D.tensionRise + rng() * D.tensionNoise) * tickFrac;
    } else {
      rel.tension -= D.tensionDecay * tickFrac;
    }
    rel.tension = clamp(rel.tension, 0, 100);

    const tensionLvl = tensionLevel(rel.tension);
    if (tensionLvl === 'crisis' || tensionLvl === 'imminent' || tensionLvl === 'collision') {
      rel.trust = Math.max(0, rel.trust - 0.3 * tickFrac);
      rel.militaryPressure = Math.min(100, rel.militaryPressure + 0.5 * tickFrac);
    } else if (tensionLvl === 'stable') {
      rel.trust = Math.min(100, rel.trust + 0.05 * tickFrac);
      rel.militaryPressure = Math.max(0, rel.militaryPressure - 0.1 * tickFrac);
    }

    if (rel.tradeVolume > 0) {
      const tradeEffect = rel.score > 0 ? 0.02 : -0.01;
      rel.tradeVolume = clamp(rel.tradeVolume + tradeEffect * tickFrac, 0, 100);
    }

    const memoryDecay = dtSec / 600;
    rel.eventMemory = rel.eventMemory.filter((m) => {
      m.delta *= 0.999;
      return Math.abs(m.delta) > 0.1;
    });
  }

  if (rng() < D.eventChance * tickFrac) {
    spawnEvent(w, rng);
  }
}

function spawnEvent(w: WorldState, rng: Rng): void {
  const list = w.countries;
  const A = list[Math.floor(rng() * list.length)];
  const B = list[Math.floor(rng() * list.length)];
  if (A === B) return;
  if (A.warId !== null || B.warId !== null) return;

  const key = pairKey(A.def.id, B.def.id);
  const rel = w.relations.get(key)!;
  const pool = templatesFor(rel.score);
  const tpl = pool[Math.floor(rng() * pool.length)];

  rel.score = clamp(rel.score + tpl.delta, -100, 100);
  rel.trust = clamp(rel.trust + tpl.trustDelta, 0, 100);
  rel.tradeVolume = clamp(rel.tradeVolume + tpl.tradeDelta, 0, 100);
  rel.militaryPressure = clamp(rel.militaryPressure + tpl.milPressureDelta, 0, 100);
  rel.lastEventTime = w.time;
  if (tpl.delta < 0) rel.tension = Math.min(100, rel.tension - tpl.delta * 0.6);

  const memory: EventMemory = {
    kind: tpl.kind,
    actorA: A.def.id,
    actorB: B.def.id,
    delta: tpl.delta,
    time: w.time,
  };
  rel.eventMemory.push(memory);
  if (rel.eventMemory.length > 10) rel.eventMemory.shift();

  const rKey = pairKey(B.def.id, A.def.id);
  const reverse = w.relations.get(rKey);
  if (reverse) {
    reverse.eventMemory.push({ ...memory, actorA: B.def.id, actorB: A.def.id });
    if (reverse.eventMemory.length > 10) reverse.eventMemory.shift();
  }

  switch (tpl.kind) {
    case 'trade-deal':
    case 'trade-mission':
      A.gdp *= 1.004;
      B.gdp *= 1.004;
      A.reputation += 1;
      B.reputation += 1;
      break;
    case 'sanctions':
      B.gdp *= 0.997;
      B.morale -= 1.5;
      A.reputation -= 2;
      break;
    case 'border-dispute':
      A.stability -= 1;
      B.stability -= 1;
      break;
    case 'treaty':
    case 'summit':
    case 'joint-exercise':
      A.influence += 1;
      B.influence += 1;
      break;
  }

  const eA = flagEmoji(A.def.code);
  const eB = flagEmoji(B.def.code);
  const event: SimEvent = {
    id: w.nextEventId++,
    time: w.time,
    day: w.day,
    kind: tpl.kind,
    actorA: A.def.id,
    actorB: B.def.id,
    delta: tpl.delta,
    headline: `${tpl.label} — ${eA} ${A.def.name} · ${eB} ${B.def.name}`,
  };
  w.news.push(event);
  if (w.news.length > CONFIG.diplomacy.newsCap) w.news.shift();
}
