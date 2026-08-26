import { CONFIG } from '../config';
import type { CountryAction, CountryRuntime, DecisionContext, Relation, War, WorldState } from './types';
import type { Rng } from '../core/rng';
import { tensionLevel } from './types';
import { pairKey } from './diplomacy';

interface ActionScore {
  action: CountryAction;
  score: number;
  target: string;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function bestRelation(ctx: DecisionContext, kind: 'hostile' | 'friendly'): Relation | null {
  let best: Relation | null = null;
  let bestScore = kind === 'hostile' ? -Infinity : Infinity;
  for (const rel of ctx.relations.values()) {
    if (rel.a !== ctx.self.def.id && rel.b !== ctx.self.def.id) continue;
    const score = kind === 'hostile' ? -rel.tension : rel.trust;
    if (kind === 'hostile' && score > bestScore) { bestScore = score; best = rel; }
    else if (kind === 'friendly' && score < bestScore) { bestScore = score; best = rel; }
  }
  return best;
}

function mostTensePair(ctx: DecisionContext): Relation | null {
  let worst: Relation | null = null;
  let worstTension = 0;
  for (const rel of ctx.relations.values()) {
    if (rel.a !== ctx.self.def.id && rel.b !== ctx.self.def.id) continue;
    if (rel.tension > worstTension) {
      worstTension = rel.tension;
      worst = rel;
    }
  }
  return worst;
}

function allies(ctx: DecisionContext): string[] {
  const allies: string[] = [];
  for (const rel of ctx.relations.values()) {
    if (rel.a !== ctx.self.def.id && rel.b !== ctx.self.def.id) continue;
    if (rel.score > 40 && rel.trust > 50) {
      allies.push(rel.a === ctx.self.def.id ? rel.b : rel.a);
    }
  }
  return allies;
}

function potentialTargets(ctx: DecisionContext): { id: string; score: number }[] {
  const targets: { id: string; score: number }[] = [];
  for (const rel of ctx.relations.values()) {
    if (rel.a !== ctx.self.def.id && rel.b !== ctx.self.def.id) continue;
    if (rel.a === ctx.self.def.id && rel.b === ctx.self.def.id) continue;
    const otherId = rel.a === ctx.self.def.id ? rel.b : rel.a;
    const other = ctx.world.byId.get(otherId);
    if (!other || other.warId !== null) continue;
    const truces = ctx.world.truces;
    const tKey = pairKey(ctx.self.def.id, otherId);
    if (truces.has(tKey) && (truces.get(tKey) ?? 0) > ctx.world.time) continue;

    const powerGap = ctx.self.power - other.power;
    const aggScore = -rel.tension + powerGap * 0.3 + ctx.self.p.aggression * 30 - rel.trust * 0.2;
    targets.push({ id: otherId, score: aggScore });
  }
  return targets.sort((a, b) => b.score - a.score);
}

export function decideAction(ctx: DecisionContext): ActionScore[] {
  const S = ctx.self;
  const scores: ActionScore[] = [];
  const tense = mostTensePair(ctx);
  const alliesList = allies(ctx);
  const targets = potentialTargets(ctx);
  const maxWars = CONFIG.war.maxConcurrentWars;
  const activeWars = ctx.wars.filter((w) => !w.outcome && (w.attackerId === S.def.id || w.defenderId === S.def.id));
  const atWar = activeWars.length > 0;

  const avgEconomy = ctx.world.countries.reduce((s, c) => s + c.gdp, 0) / ctx.world.countries.length;
  const economyRatio = S.gdp / Math.max(avgEconomy, 1);

  for (const target of targets) {
    const rel = ctx.relations.get(pairKey(S.def.id, target.id));
    if (!rel) continue;
    const other = ctx.world.byId.get(target.id)!;

    let warScore = 0;
    if (!atWar && activeWars.length < maxWars) {
      const powerAdv = (S.power - other.power) / 100;
      const tensionBonus = rel.tension > 70 ? 30 : rel.tension > 50 ? 15 : 0;
      const aggressionBonus = S.p.aggression * 25;
      const trustPenalty = rel.trust * 0.15;
      warScore = powerAdv * 20 + tensionBonus + aggressionBonus - trustPenalty;
      if (S.p.type === 'aggressive') warScore += 12;
      if (S.p.type === 'defensive') warScore -= 20;
    }
    scores.push({ action: 'declare-war', score: warScore, target: target.id });

    if (atWar) {
      const myWar = activeWars[0];
      const isAttacker = myWar.attackerId === S.def.id;
      const enemyId = isAttacker ? myWar.defenderId : myWar.attackerId;
      if (target.id === enemyId) {
        const peaceScore = -myWar.momentum * 0.1 + (S.morale < 30 ? 20 : 0) + (S.stability < 35 ? 15 : 0) - 10;
        scores.push({ action: 'offer-peace', score: peaceScore, target: target.id });
      }
    }

    const threatScore = rel.tension * 0.3 + rel.militaryPressure * 0.2 - rel.trust * 0.1;
    scores.push({ action: 'threaten', score: threatScore, target: target.id });

    const sanctionScore = rel.score < -30 ? 15 + (-rel.score) * 0.1 : -5;
    scores.push({ action: 'sanction', score: sanctionScore, target: target.id });

    const tradeScore = rel.score > -10 ? 8 + rel.trust * 0.1 + economyRatio * 5 : -10;
    scores.push({ action: 'trade', score: tradeScore, target: target.id });

    const negotiateScore = rel.tension > 30 && rel.tension < 80 ? 12 + rel.trust * 0.1 : -5;
    scores.push({ action: 'negotiate', score: negotiateScore, target: target.id });

    const allyScore = rel.score > 30 && rel.trust > 40 ? 10 + rel.score * 0.1 : -15;
    scores.push({ action: 'ally', score: allyScore, target: target.id });
  }

  const observeScore = atWar ? -20 : 5;
  scores.push({ action: 'observe', score: observeScore, target: '' });

  const buildMilScore = atWar ? 15 : (S.military < 30 ? 12 : 0) + S.p.aggression * 8 - (S.debt / Math.max(S.gdp, 1)) * 30;
  scores.push({ action: 'build-military', score: buildMilScore, target: '' });

  const expandScore = S.gdp > avgEconomy * 1.2 ? 8 + S.p.riskTolerance * 10 : -5;
  scores.push({ action: 'expand', score: expandScore, target: '' });

  if (atWar) {
    const myWar = activeWars[0];
    const enemyId = myWar.attackerId === S.def.id ? myWar.defenderId : myWar.attackerId;
    const retreatScore = (S.morale < 25 ? 20 : 0) + (S.stability < 30 ? 15 : 0) + (-myWar.momentum * 0.2);
    scores.push({ action: 'retreat', score: retreatScore, target: enemyId });
  }

  return scores.sort((a, b) => b.score - a.score);
}

export function executeDecision(ctx: DecisionContext, action: ActionScore): void {
  const S = ctx.self;
  const rng = ctx.rng;
  const W = ctx.world;

  switch (action.action) {
    case 'trade': {
      const other = W.byId.get(action.target);
      if (!other) break;
      const rel = W.relations.get(pairKey(S.def.id, action.target));
      if (!rel) break;
      const bonus = S.gdp * 0.002;
      S.gdp += bonus;
      other.gdp += bonus;
      S.reputation += 0.5;
      rel.tradeVolume = clamp(rel.tradeVolume + 3, 0, 100);
      rel.score = clamp(rel.score + 3, -100, 100);
      break;
    }
    case 'negotiate': {
      const rel = W.relations.get(pairKey(S.def.id, action.target));
      if (!rel) break;
      rel.score = clamp(rel.score + 4, -100, 100);
      rel.tension = Math.max(0, rel.tension - 5);
      rel.trust = clamp(rel.trust + 2, 0, 100);
      break;
    }
    case 'ally': {
      const rel = W.relations.get(pairKey(S.def.id, action.target));
      if (!rel) break;
      rel.score = clamp(rel.score + 8, -100, 100);
      rel.trust = clamp(rel.trust + 6, 0, 100);
      rel.militaryPressure = Math.max(0, rel.militaryPressure - 8);
      break;
    }
    case 'build-military': {
      S.military = clamp(S.military + 1.5, 0, 100);
      S.stability = Math.max(0, S.stability - 0.5);
      break;
    }
    case 'threaten': {
      const rel = W.relations.get(pairKey(S.def.id, action.target));
      if (!rel) break;
      rel.tension = Math.min(100, rel.tension + 4);
      rel.militaryPressure = clamp(rel.militaryPressure + 3, 0, 100);
      rel.trust = Math.max(0, rel.trust - 2);
      S.reputation += rng() > 0.5 ? 1 : -1;
      break;
    }
    case 'sanction': {
      const other = W.byId.get(action.target);
      if (!other) break;
      const rel = W.relations.get(pairKey(S.def.id, action.target));
      if (!rel) break;
      other.gdp *= 0.998;
      other.morale -= 0.8;
      rel.score = clamp(rel.score - 5, -100, 100);
      rel.tradeVolume = Math.max(0, rel.tradeVolume - 10);
      S.reputation -= 1;
      break;
    }
    case 'expand': {
      S.influence = clamp(S.influence + 2, 0, 100);
      S.gdp *= 1.003;
      break;
    }
    case 'retreat': {
      S.military = Math.max(0, S.military - 2);
      S.stability = clamp(S.stability + 1, 0, 100);
      break;
    }
    case 'declare-war':
    case 'offer-peace':
    case 'observe':
      break;
  }
}
