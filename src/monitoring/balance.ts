import type { WorldState } from '../sim/types';

export interface CountryBalanceReport {
  powerConcentration: number;
  top1Dominance: number;
  top3Dominance: number;
  weakCountrySurvival: number;
  economicInequality: number;
  militaryInequality: number;
  giniCoefficient: number;
  alerts: string[];
}

export interface WarBalanceReport {
  avgWarDuration: number;
  avgWarIntensity: number;
  activeWars: number;
  warDeclarationRate: number;
  peaceRate: number;
  warExhaustion: number;
  alerts: string[];
}

export interface AllianceBalanceReport {
  allianceCount: number;
  largestAlliance: number;
  avgAllianceAge: number;
  dominantAllianceRisk: number;
  alerts: string[];
}

export class CountryBalanceMonitor {
  private powerHistory: Map<string, number[]> = new Map();
  private maxHistory = 100;

  report(w: WorldState): CountryBalanceReport {
    const powers = w.countries.map((c) => c.power).sort((a, b) => b - a);
    const gdps = w.countries.map((c) => c.gdp).sort((a, b) => b - a);
    const militaries = w.countries.map((c) => c.military).sort((a, b) => b - a);
    const totalPower = powers.reduce((s, p) => s + p, 0);

    const top1Dominance = totalPower > 0 ? (powers[0] / totalPower) * 100 : 0;
    const top3Sum = powers.slice(0, 3).reduce((s, p) => s + p, 0);
    const top3Dominance = totalPower > 0 ? (top3Sum / totalPower) * 100 : 0;

    const weakCount = powers.filter((p) => p < 30).length;
    const weakCountrySurvival = (weakCount / Math.max(1, powers.length)) * 100;

    const avgGdp = gdps.reduce((s, g) => s + g, 0) / Math.max(1, gdps.length);
    const avgMil = militaries.reduce((s, m) => s + m, 0) / Math.max(1, militaries.length);

    const economicInequality = avgGdp > 0
      ? gdps.reduce((s, g) => s + Math.abs(g - avgGdp), 0) / (gdps.length * avgGdp) * 100
      : 0;
    const militaryInequality = avgMil > 0
      ? militaries.reduce((s, m) => s + Math.abs(m - avgMil), 0) / (militaries.length * avgMil) * 100
      : 0;

    const gini = this.calculateGini(powers);

    const alerts: string[] = [];
    if (top1Dominance > 20) alerts.push(`⚠️ Top-1 dominance: ${top1Dominance.toFixed(1)}%`);
    if (top3Dominance > 55) alerts.push(`⚠️ Top-3 dominance: ${top3Dominance.toFixed(1)}%`);
    if (gini > 0.5) alerts.push(`⚠️ Power inequality (Gini): ${gini.toFixed(2)}`);
    if (weakCountrySurvival > 50) alerts.push(`⚠️ ${weakCountrySurvival.toFixed(0)}% countries below power 30`);

    return {
      powerConcentration: top3Dominance,
      top1Dominance,
      top3Dominance,
      weakCountrySurvival,
      economicInequality,
      militaryInequality,
      giniCoefficient: gini,
      alerts,
    };
  }

  private calculateGini(values: number[]): number {
    const n = values.length;
    if (n === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += (2 * (i + 1) - n - 1) * sorted[i];
    }
    const mean = sorted.reduce((s, v) => s + v, 0) / n;
    return mean > 0 ? sum / (n * n * mean) : 0;
  }

  detectRunaway(w: WorldState): string | null {
    for (const c of w.countries) {
      const history = this.powerHistory.get(c.def.id) ?? [];
      history.push(c.power);
      if (history.length > this.maxHistory) history.shift();
      this.powerHistory.set(c.def.id, history);

      if (history.length >= 20) {
        const recent = history.slice(-20);
        const avg = recent.reduce((s, p) => s + p, 0) / recent.length;
        const trend = recent[recent.length - 1] - recent[0];
        if (trend > 20 && c.power > avg * 1.5) {
          return `${c.def.name} is runaway (power ${c.power.toFixed(0)}, trend +${trend.toFixed(0)})`;
        }
      }
    }
    return null;
  }

  suggestNaturalBalance(w: WorldState): string[] {
    const suggestions: string[] = [];
    const top = [...w.countries].sort((a, b) => b.power - a.power)[0];
    if (top && top.power > 90) {
      suggestions.push(`${top.def.name} dominance should be challenged by rival alliances`);
      suggestions.push('Economic pressure from trade competitors');
      suggestions.push('Internal instability from overextension');
    }
    return suggestions;
  }

  reset(): void {
    this.powerHistory.clear();
  }
}

export class WarBalanceMonitor {
  private warDurations: number[] = [];
  private warIntensities: number[] = [];
  private warStartTimes: number[] = [];
  private peaceTimes: number[] = [];
  private maxHistory = 50;

  recordWarEnd(war: { startTime: number; intensity: number; endTime: number }): void {
    const duration = war.endTime - war.startTime;
    this.warDurations.push(duration);
    this.warIntensities.push(war.intensity);
    if (this.warDurations.length > this.maxHistory) this.warDurations.shift();
    if (this.warIntensities.length > this.maxHistory) this.warIntensities.shift();
  }

  recordWarStart(time: number): void {
    this.warStartTimes.push(time);
    if (this.warStartTimes.length > this.maxHistory) this.warStartTimes.shift();
  }

  recordPeace(time: number): void {
    this.peaceTimes.push(time);
    if (this.peaceTimes.length > this.maxHistory) this.peaceTimes.shift();
  }

  report(w: WorldState, windowSec = 3600): WarBalanceReport {
    let activeWars = 0;
    for (const war of w.wars.values()) {
      if (!war.outcome) activeWars++;
    }

    const avgDuration = this.warDurations.length > 0
      ? this.warDurations.reduce((s, d) => s + d, 0) / this.warDurations.length
      : 0;
    const avgIntensity = this.warIntensities.length > 0
      ? this.warIntensities.reduce((s, i) => s + i, 0) / this.warIntensities.length
      : 0;

    const cutoff = w.time - windowSec;
    const recentStarts = this.warStartTimes.filter((t) => t > cutoff).length;
    const recentPeaces = this.peaceTimes.filter((t) => t > cutoff).length;
    const warDeclarationRate = windowSec > 0 ? recentStarts / (windowSec / 60) : 0;
    const peaceRate = windowSec > 0 ? recentPeaces / (windowSec / 60) : 0;

    let warExhaustion = 0;
    for (const war of w.wars.values()) {
      if (!war.outcome) {
        const duration = w.time - war.startTime;
        warExhaustion = Math.max(warExhaustion, Math.min(100, duration / 10));
      }
    }

    const alerts: string[] = [];
    if (activeWars === 0 && w.time > 600) {
      const lastWarEnd = Math.max(0, ...this.warDurations);
      if (lastWarEnd > 600) alerts.push('⚠️ No wars for extended period');
    }
    if (activeWars > 3) alerts.push(`⚠️ ${activeWars} simultaneous wars`);
    if (avgDuration > 300) alerts.push(`⚠️ Average war duration: ${avgDuration.toFixed(0)}s`);

    return {
      avgWarDuration: avgDuration,
      avgWarIntensity: avgIntensity,
      activeWars,
      warDeclarationRate,
      peaceRate,
      warExhaustion,
      alerts,
    };
  }

  detectEndlessWar(w: WorldState): string | null {
    for (const war of w.wars.values()) {
      if (war.outcome) continue;
      const duration = w.time - war.startTime;
      if (duration > 600) {
        return `War #${war.id} (${war.attackerId} vs ${war.defenderId}) ongoing for ${duration.toFixed(0)}s`;
      }
    }
    return null;
  }

  reset(): void {
    this.warDurations = [];
    this.warIntensities = [];
    this.warStartTimes = [];
    this.peaceTimes = [];
  }
}

export class AllianceBalanceMonitor {
  report(_w: WorldState): AllianceBalanceReport {
    return {
      allianceCount: 0,
      largestAlliance: 0,
      avgAllianceAge: 0,
      dominantAllianceRisk: 0,
      alerts: [],
    };
  }

  reset(): void {}
}
