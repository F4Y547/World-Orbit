import type { EventKind, War, WorldState } from '../sim/types';

interface RepetitionEntry {
  time: number;
  kind: EventKind;
  actors: string[];
  warPair?: string;
}

export interface RepetitionReport {
  blocked: boolean;
  reason: string;
  suggestion: string;
}

export class AntiRepetition {
  private recentEvents: RepetitionEntry[] = [];
  private recentWars: string[] = [];
  private recentSpectacleTypes: string[] = [];
  private maxHistory = 50;

  recordEvent(event: { kind: EventKind; time: number; actorA: string; actorB: string; spectacle?: { mood: string } }): void {
    this.recentEvents.push({
      time: event.time,
      kind: event.kind,
      actors: [event.actorA, event.actorB].filter(Boolean),
    });
    if (this.recentEvents.length > this.maxHistory) this.recentEvents.shift();

    if (event.spectacle) {
      this.recentSpectacleTypes.push(event.spectacle.mood);
      if (this.recentSpectacleTypes.length > this.maxHistory) this.recentSpectacleTypes.shift();
    }
  }

  recordWarStart(war: War): void {
    const pair = [war.attackerId, war.defenderId].sort().join('|');
    this.recentWars.push(pair);
    if (this.recentWars.length > 20) this.recentWars.shift();
  }

  checkEvent(kind: EventKind, actors: string[]): RepetitionReport {
    const recent = this.recentEvents.slice(-10);

    const sameKindCount = recent.filter((e) => e.kind === kind).length;
    if (sameKindCount >= 3) {
      return {
        blocked: true,
        reason: `Event kind "${kind}" appeared ${sameKindCount} times in last 10 events`,
        suggestion: `Force a different event type`,
      };
    }

    if (actors.length === 2) {
      const pair = actors.sort().join('|');
      const samePairCount = recent.filter(
        (e) => e.actors.length === 2 && e.actors.sort().join('|') === pair
      ).length;
      if (samePairCount >= 2) {
        return {
          blocked: true,
          reason: `Same country pair (${actors[0]} vs ${actors[1]}) appeared ${samePairCount} times recently`,
          suggestion: `Select different countries`,
        };
      }
    }

    const warPattern = this.checkWarPattern();
    if (warPattern) return warPattern;

    return { blocked: false, reason: '', suggestion: '' };
  }

  private checkWarPattern(): RepetitionReport | null {
    if (this.recentWars.length < 4) return null;

    const last4 = this.recentWars.slice(-4);
    const uniquePairs = new Set(last4);
    if (uniquePairs.size === 1) {
      return {
        blocked: true,
        reason: `Same war pair repeated ${last4.length} times`,
        suggestion: `Prevent repeated wars between same countries`,
      };
    }

    const alternating = last4[0] === last4[2] && last4[1] === last4[3] && last4[0] !== last4[1];
    if (alternating) {
      return {
        blocked: true,
        reason: `Alternating war pattern detected (A-B-A-B)`,
        suggestion: `Introduce different conflict pairs`,
      };
    }

    return null;
  }

  checkCountryOveruse(countryId: string, window = 10): boolean {
    const recent = this.recentEvents.slice(-window);
    const count = recent.filter((e) => e.actors.includes(countryId)).length;
    return count >= 4;
  }

  getSpectacleDiversity(): number {
    if (this.recentSpectacleTypes.length === 0) return 1;
    const unique = new Set(this.recentSpectacleTypes);
    return unique.size / this.recentSpectacleTypes.length;
  }

  getWarPairFrequency(): Map<string, number> {
    const freq = new Map<string, number>();
    for (const pair of this.recentWars) {
      freq.set(pair, (freq.get(pair) ?? 0) + 1);
    }
    return freq;
  }

  reset(): void {
    this.recentEvents = [];
    this.recentWars = [];
    this.recentSpectacleTypes = [];
  }
}
