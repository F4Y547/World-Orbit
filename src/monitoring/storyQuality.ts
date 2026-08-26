import type { SimEvent, StoryTier, WorldState } from '../sim/types';

export interface StoryQualityScore {
  storyId: string;
  score: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  reasons: string[];
  breakdown: {
    escalation: number;
    rarity: number;
    duration: number;
    consequence: number;
    powerShift: number;
    unpredictability: number;
    coherence: number;
    resolution: number;
  };
}

export interface StoryArc {
  id: string;
  startDay: number;
  startTime: number;
  actors: string[];
  events: SimEvent[];
  tier: StoryTier;
  resolved: boolean;
  resolvedDay?: number;
  powerShiftBefore?: Map<string, number>;
  powerShiftAfter?: Map<string, number>;
}

export class StoryQualityEngine {
  private arcs: StoryArc[] = [];
  private scores: StoryQualityScore[] = [];
  private nextArcId = 1;

  startArc(w: WorldState, actors: string[], tier: StoryTier): string {
    const id = `arc-${this.nextArcId++}`;
    const powerShiftBefore = new Map<string, number>();
    for (const c of w.countries) {
      powerShiftBefore.set(c.def.id, c.power);
    }
    this.arcs.push({
      id,
      startDay: w.day,
      startTime: w.time,
      actors,
      events: [],
      tier,
      resolved: false,
      powerShiftBefore,
    });
    return id;
  }

  addEvent(arcId: string, event: SimEvent): void {
    const arc = this.arcs.find((a) => a.id === arcId);
    if (arc) arc.events.push(event);
  }

  resolveArc(arcId: string, w: WorldState): StoryQualityScore | null {
    const found = this.arcs.find((a) => a.id === arcId && !a.resolved);
    if (!found) return null;

    found.resolved = true;
    found.resolvedDay = w.day;
    found.powerShiftAfter = new Map();
    for (const c of w.countries) {
      found.powerShiftAfter.set(c.def.id, c.power);
    }

    const score = this.scoreArc(found);
    this.scores.push(score);
    return score;
  }

  private scoreArc(arc: StoryArc): StoryQualityScore {
    const reasons: string[] = [];
    const b = {
      escalation: 0,
      rarity: 0,
      duration: 0,
      consequence: 0,
      powerShift: 0,
      unpredictability: 0,
      coherence: 0,
      resolution: 0,
    };

    b.escalation = this.scoreEscalation(arc, reasons);
    b.rarity = this.scoreRarity(arc, reasons);
    b.duration = this.scoreDuration(arc, reasons);
    b.consequence = this.scoreConsequence(arc, reasons);
    b.powerShift = this.scorePowerShift(arc, reasons);
    b.unpredictability = this.scoreUnpredictability(arc, reasons);
    b.coherence = this.scoreCoherence(arc, reasons);
    b.resolution = this.scoreResolution(arc, reasons);

    const total = Math.round(
      b.escalation * 0.15 +
      b.rarity * 0.1 +
      b.duration * 0.1 +
      b.consequence * 0.15 +
      b.powerShift * 0.15 +
      b.unpredictability * 0.15 +
      b.coherence * 0.1 +
      b.resolution * 0.1
    );

    const grade = total >= 90 ? 'S' : total >= 75 ? 'A' : total >= 60 ? 'B' : total >= 40 ? 'C' : 'D';

    return {
      storyId: arc.id,
      score: total,
      grade,
      reasons,
      breakdown: b,
    };
  }

  private scoreEscalation(storyArc: StoryArc, reasons: string[]): number {
    const tensions = storyArc.events.map((e) => Math.abs(e.delta));
    if (tensions.length === 0) return 30;
    const maxDelta = Math.max(...tensions);
    const avgDelta = tensions.reduce((s, d) => s + d, 0) / tensions.length;
    const escalationRatio = maxDelta / Math.max(avgDelta, 1);
    const score = Math.min(100, Math.round(escalationRatio * 25 + tensions.length * 5));
    if (escalationRatio > 3) reasons.push('Strong escalation curve');
    if (tensions.length > 5) reasons.push('Extended escalation');
    return score;
  }

  private scoreRarity(arc: StoryArc, _reasons: string[]): number {
    const tierScores: Record<StoryTier, number> = {
      common: 20,
      uncommon: 45,
      rare: 75,
      legendary: 100,
    };
    return tierScores[arc.tier];
  }

  private scoreDuration(arc: StoryArc, reasons: string[]): number {
    const durDays = arc.resolvedDay !== undefined ? arc.resolvedDay - arc.startDay : 1;
    if (durDays >= 3 && durDays <= 30) {
      reasons.push(`Well-paced (${durDays} days)`);
      return 90;
    }
    if (durDays < 3) return 40;
    if (durDays <= 7) return 70;
    return 50;
  }

  private scoreConsequence(arc: StoryArc, reasons: string[]): number {
    let score = 30;
    const headlineDeltas = arc.events.map((e) => Math.abs(e.delta));
    const totalImpact = headlineDeltas.reduce((s, d) => s + d, 0);
    if (totalImpact > 100) {
      score += 30;
      reasons.push('Major world impact');
    } else if (totalImpact > 50) {
      score += 15;
      reasons.push('Moderate impact');
    }
    if (arc.events.some((e) => e.kind === 'victory' || e.kind === 'peace')) {
      score += 20;
      reasons.push('War resolved');
    }
    return Math.min(100, score);
  }

  private scorePowerShift(arc: StoryArc, reasons: string[]): number {
    if (!arc.powerShiftBefore || !arc.powerShiftAfter) return 30;
    let maxShift = 0;
    for (const [id, before] of arc.powerShiftBefore) {
      const after = arc.powerShiftAfter.get(id) ?? before;
      const shift = Math.abs(after - before);
      maxShift = Math.max(maxShift, shift);
    }
    const score = Math.min(100, Math.round(maxShift * 2));
    if (maxShift > 15) reasons.push(`Significant power shift (${maxShift.toFixed(1)})`);
    return score;
  }

  private scoreUnpredictability(arc: StoryArc, reasons: string[]): number {
    const kinds = arc.events.map((e) => e.kind);
    const uniqueKinds = new Set(kinds).size;
    const score = Math.min(100, 30 + uniqueKinds * 15);
    if (uniqueKinds > 3) reasons.push('Multi-faceted narrative');
    return score;
  }

  private scoreCoherence(arc: StoryArc, reasons: string[]): number {
    const actors = arc.actors;
    const eventsWithActors = arc.events.filter(
      (e) => actors.includes(e.actorA) || actors.includes(e.actorB)
    );
    const coherence = arc.events.length > 0
      ? eventsWithActors.length / arc.events.length
      : 0;
    const score = Math.round(coherence * 100);
    if (coherence > 0.8) reasons.push('Tightly focused narrative');
    return score;
  }

  private scoreResolution(arc: StoryArc, reasons: string[]): number {
    if (!arc.resolved) return 0;
    const lastEvent = arc.events[arc.events.length - 1];
    if (!lastEvent) return 30;
    if (lastEvent.kind === 'victory' || lastEvent.kind === 'peace' || lastEvent.kind === 'mystery-resolve') {
      reasons.push('Clear resolution');
      return 95;
    }
    if (lastEvent.kind === 'new-era' || lastEvent.kind === 'transformation') {
      reasons.push('Transformative resolution');
      return 90;
    }
    return 60;
  }

  getScores(): StoryQualityScore[] {
    return this.scores;
  }

  getAverageScore(): number {
    if (this.scores.length === 0) return 0;
    return this.scores.reduce((s, sc) => s + sc.score, 0) / this.scores.length;
  }

  getGradeDistribution(): Record<string, number> {
    const dist: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    for (const sc of this.scores) dist[sc.grade]++;
    return dist;
  }

  reset(): void {
    this.arcs = [];
    this.scores = [];
    this.nextArcId = 1;
  }
}
