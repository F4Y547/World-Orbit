import { CONFIG } from '../config';
import { mulberry32, range, type Rng } from '../core/rng';
import type { CountryDef, CountryRuntime, Personality, WorldState } from './types';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function rollPersonality(rng: Rng): Personality {
  const roll = rng();
  const type =
    roll < 0.2
      ? 'aggressive'
      : roll < 0.4
        ? 'defensive'
        : roll < 0.6
          ? 'diplomatic'
          : roll < 0.85
            ? 'opportunistic'
            : 'unpredictable';
  const aggBase =
    type === 'aggressive' ? 0.78 : type === 'defensive' ? 0.24 : type === 'diplomatic' ? 0.32 : 0.5;
  const riskBase =
    type === 'aggressive' || type === 'unpredictable' ? 0.7 : type === 'opportunistic' ? 0.55 : 0.35;
  return {
    type,
    aggression: clamp(aggBase + rng() * 0.2 - 0.1, 0.05, 1),
    riskTolerance: clamp(riskBase + rng() * 0.2 - 0.1, 0.05, 1),
    techFocus: range(rng, 0.25, 0.85),
  };
}

export function createRuntimes(defs: CountryDef[], persRng: Rng): CountryRuntime[] {
  return defs.map((def) => {
    const resVals = Object.values(def.resources);
    const resourcesScore = resVals.reduce((a, b) => a + b, 0) / resVals.length;
    const p = rollPersonality(persRng);
    const jitter = () => persRng() * 6 - 3;
    const gdp = Math.pow(def.power, 2.1) * 3;
    return {
      def,
      p,
      gdp,
      wealth: gdp * 0.12,
      debt: gdp * 0.05 * persRng(),
      economy: clamp(def.power * 0.92 + jitter(), 5, 100),
      military: clamp(def.power * (0.8 + p.aggression * 0.35) + jitter(), 5, 100),
      technology: clamp(def.power * 0.72 + def.resources.technology * 0.18 + jitter(), 5, 100),
      industry: clamp(def.power * 0.75 + def.resources.metals * 0.1 + jitter(), 5, 100),
      stability: clamp(52 + (p.type === 'defensive' ? 9 : 0) + jitter() * 2, 10, 95),
      morale: clamp(50 + jitter() * 2, 10, 90),
      publicSupport: clamp(50 + jitter() * 2, 10, 90),
      influence: clamp(def.power * 0.6 + jitter(), 5, 100),
      reputation: clamp(jitter() * 4, -40, 40),
      population: def.population,
      resourcesScore,
      power: def.power,
      prevPower: def.power,
      ringTarget: def.tier,
      lastRingChange: -1e9,
      growthSmoothed: CONFIG.economy.baseGrowth,
      warId: null,
      exhaustion: 0,
      defeatUntil: 0,
    };
  });
}

interface PartnerCounts {
  fr: number;
  ho: number;
}

export function partnerCounts(w: WorldState): Map<string, PartnerCounts> {
  const counts = new Map<string, PartnerCounts>();
  for (const c of w.countries) counts.set(c.def.id, { fr: 0, ho: 0 });
  for (const rel of w.relations.values()) {
    if (rel.score >= 25) {
      counts.get(rel.a)!.fr++;
      counts.get(rel.b)!.fr++;
    } else if (rel.score <= -40) {
      counts.get(rel.a)!.ho++;
      counts.get(rel.b)!.ho++;
    }
  }
  return counts;
}

function threatLevel(w: WorldState, id: string): number {
  let threat = 0;
  for (const rel of w.relations.values()) {
    if (rel.a !== id && rel.b !== id) continue;
    if (rel.score >= -20) continue;
    const otherId = rel.a === id ? rel.b : rel.a;
    const other = w.byId.get(otherId)!;
    threat += (-rel.score / 100) * (other.power / 100);
  }
  return threat;
}

export function econTick(w: WorldState, dtSec: number, rng: Rng): void {
  const E = CONFIG.economy;
  const counts = partnerCounts(w);
  let maxGdp = 1;
  for (const c of w.countries) maxGdp = Math.max(maxGdp, c.gdp);

  for (const c of w.countries) {
    const pc = counts.get(c.def.id)!;
    const tradeFr = Math.min(pc.fr, E.tradePartnerCap);
    const tradeHo = Math.min(pc.ho, E.tradePartnerCap);
    const scaleDrag = (c.gdp / maxGdp) * 0.0006;
    const war = c.warId !== null ? w.wars.get(c.warId) : undefined;
    const atWar = war !== undefined && !war.outcome;
    let growth =
      E.baseGrowth +
      (rng() * 2 - 1) * E.growthNoise +
      tradeFr * E.friendlyTradeBonus -
      tradeHo * E.hostileTradePenalty +
      (c.stability - 55) * 0.00006 +
      (c.morale - 50) * 0.00004 +
      (c.technology - 70) * 0.00004 +
      (c.industry - 55) * 0.00006 -
      scaleDrag -
      Math.max(0, c.debt / Math.max(c.gdp, 1) - 0.5) * E.debtGrowthDrag -
      (c.economy - 55) * E.convergencePull;
    if (atWar && war) growth -= CONFIG.war.growthDrag * (0.6 + war.intensity);
    growth = clamp(growth, -0.02, 0.02);
    c.growthSmoothed += (growth - c.growthSmoothed) * 0.25;

    const gdpGrowth = growth * E.gdpGrowthBase;
    const gdpDecay = E.gdpDecayRate * c.gdp;
    c.gdp = Math.max(100, c.gdp + gdpGrowth - gdpDecay);
    c.population *= 1 + 0.0006 * (c.stability / 70);

    const income = c.gdp * E.taxRate * (0.5 + c.stability / 200);
    const upkeepMil =
      c.gdp * E.militaryUpkeepRate * (c.military / 60) * (atWar ? CONFIG.war.upkeepMul : 1);
    const interest = c.debt * E.debtInterest;
    const balance = income - upkeepMil - interest;

    if (balance >= 0) {
      const repay = Math.min(c.wealth + balance, c.debt);
      if (c.wealth + balance >= c.debt) {
        c.wealth += balance - repay;
        c.debt -= repay;
        c.debt = Math.max(0, c.debt - balance * 0.1);
      } else {
        c.debt -= c.wealth + balance;
        c.wealth = 0;
      }
    } else if (c.wealth + balance >= 0) {
      c.wealth += balance;
    } else {
      c.debt += -(c.wealth + balance);
      c.wealth = 0;
    }

    const debtRatio = c.debt / Math.max(c.gdp, 1);
    const milTarget =
      16 +
      c.p.aggression * 36 +
      threatLevel(w, c.def.id) * CONFIG.military.threatWeight +
      debtRatio * -14;
    const approach =
      milTarget > c.military ? CONFIG.military.approachUp : -CONFIG.military.approachDown;
    c.military += approach * (dtSec / CONFIG.econIntervalSec) * (debtRatio > 1 ? -0.5 : 1);
    c.military = clamp(c.military, 4, 100);

    const funding = clamp(0.7 + (c.wealth / Math.max(c.gdp, 1)) * 2, 0.6, 1.6);
    c.technology +=
      (0.05 + 0.08 * c.p.techFocus) *
      (c.industry / 80) *
      (1 - c.technology / 110) *
      funding *
      (dtSec / CONFIG.econIntervalSec);
    c.technology = clamp(c.technology, 1, 100);

    c.industry += ((42 + c.economy * 0.35 + c.stability * 0.18) - c.industry) * 0.06;
    c.industry = clamp(c.industry, 5, 100);

    const surplusRatio = income > 0 ? balance / income : 0;
    let stabTarget =
      48 +
      (c.p.type === 'defensive' ? 8 : 0) +
      surplusRatio * 22 -
      debtRatio * 16;
    if (atWar) stabTarget -= 6 + c.exhaustion * 0.08;
    c.stability += (clamp(stabTarget, 15, 90) - c.stability) * 0.07 + (rng() * 2 - 1) * 0.4;
    c.stability = clamp(c.stability, 5, 98);

    let moraleTarget = 48 + c.growthSmoothed * 900 + surplusRatio * 26 - debtRatio * 8;
    if (atWar) moraleTarget -= 8 + c.exhaustion * 0.18;
    c.morale += (clamp(moraleTarget, 10, 95) - c.morale) * 0.08;
    c.publicSupport += (clamp((moraleTarget + c.stability) / 2, 10, 95) - c.publicSupport) * 0.06;

    if (atWar) c.exhaustion = clamp(c.exhaustion + dtSec * 0.012, 0, 100);
    else c.exhaustion = Math.max(0, c.exhaustion - dtSec * 0.05);

    c.reputation += (0 - c.reputation) * 0.02 + c.growthSmoothed * 6;

    c.economy = clamp(c.economy, 1, 100);
    c.influence = clamp(c.influence, 1, 100);
    c.reputation = clamp(c.reputation, -60, 60);
    c.morale = clamp(c.morale, 5, 98);
    c.publicSupport = clamp(c.publicSupport, 5, 98);
  }
}

function assignRingsByRank(w: WorldState): void {
  const capacities = [0, 0];
  for (const c of w.countries) {
    if (c.def.tier < 2) capacities[c.def.tier]++;
  }
  const sorted = [...w.countries].sort((a, b) => b.power - a.power);
  for (let rank = 0; rank < sorted.length; rank++) {
    const desired = rank < capacities[0] ? 0 : rank < capacities[0] + capacities[1] ? 1 : 2;
    const c = sorted[rank];
    if (desired !== c.ringTarget && w.time - c.lastRingChange >= CONFIG.ringCooldownSec) {
      c.lastRingChange = w.time;
      c.ringTarget = desired;
    }
  }
}

export function recalcPower(w: WorldState): void {
  const W = CONFIG.powerWeights;
  const E = CONFIG.economy;
  let maxGdp = 1;
  let maxPop = 1;
  for (const c of w.countries) {
    maxGdp = Math.max(maxGdp, c.gdp);
    maxPop = Math.max(maxPop, c.population);
  }

  const counts = partnerCounts(w);
  for (const c of w.countries) {
    c.economy = 100 * Math.pow(c.gdp / maxGdp, E.economyExponent);
    const popIdx = 100 * Math.sqrt(c.population / maxPop);
    const pc = counts.get(c.def.id)!;
    const friendShare = pc.fr / Math.max(1, w.countries.length - 1);
    const influenceTarget =
      0.45 * c.power + 0.3 * ((c.reputation + 60) / 1.6) + 0.25 * friendShare * 100;
    c.influence += (influenceTarget - c.influence) * 0.1;
  }

  let maxRaw = 1;
  const raws = new Map<string, number>();
  for (const c of w.countries) {
    const raw =
      W.military * c.military +
      W.economy * c.economy +
      W.technology * c.technology +
      W.population * (100 * Math.sqrt(c.population / maxPop)) +
      W.stability * c.stability +
      W.resources * c.resourcesScore +
      W.diplomacy * c.influence;
    raws.set(c.def.id, raw);
    maxRaw = Math.max(maxRaw, raw);
  }

  for (const c of w.countries) {
    c.prevPower = c.power;
    const target = 100 * (raws.get(c.def.id)! / maxRaw);
    c.power += (target - c.power) * 0.4;
  }

  assignRingsByRank(w);
}
