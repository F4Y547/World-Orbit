import type { RecordedStory } from './recorder';

export type HighlightTier = 'legendary' | 'excellent' | 'good' | 'normal' | 'archive';

export interface HighlightCandidate {
  storyId: string;
  tier: HighlightTier;
  score: number;
  reason: string;
  detectedAt: number;
  rendered: boolean;
  exported: boolean;
}

export interface HighlightDetectorConfig {
  legendaryThreshold: number;
  excellentThreshold: number;
  goodThreshold: number;
  normalThreshold: number;
}

const DEFAULT_CONFIG: HighlightDetectorConfig = {
  legendaryThreshold: 90,
  excellentThreshold: 80,
  goodThreshold: 70,
  normalThreshold: 60,
};

export class HighlightDetector {
  private candidates: HighlightCandidate[] = [];
  private config: HighlightDetectorConfig;
  private onDetected: ((candidate: HighlightCandidate) => void) | null = null;

  constructor(config: Partial<HighlightDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setCallback(callback: (candidate: HighlightCandidate) => void): void {
    this.onDetected = callback;
  }

  evaluate(story: RecordedStory): HighlightCandidate | null {
    const score = story.storyScore;
    let tier: HighlightTier;
    let reason: string;

    if (score >= this.config.legendaryThreshold) {
      tier = 'legendary';
      reason = this.buildLegendaryReason(story);
    } else if (score >= this.config.excellentThreshold) {
      tier = 'excellent';
      reason = this.buildExcellentReason(story);
    } else if (score >= this.config.goodThreshold) {
      tier = 'good';
      reason = this.buildGoodReason(story);
    } else if (score >= this.config.normalThreshold) {
      tier = 'normal';
      reason = 'Notable world event';
    } else {
      return null;
    }

    const candidate: HighlightCandidate = {
      storyId: story.id,
      tier,
      score,
      reason,
      detectedAt: Date.now(),
      rendered: false,
      exported: false,
    };

    this.candidates.push(candidate);
    this.onDetected?.(candidate);
    return candidate;
  }

  private buildLegendaryReason(story: RecordedStory): string {
    const actorNames = story.actors.slice(0, 3).join(' vs ');
    if (story.peakTension >= 95) return `${actorNames} — tension reached ${story.peakTension.toFixed(0)}%`;
    if (story.peakSpectacle >= 0.95) return `${actorNames} — spectacle peaked at ${(story.peakSpectacle * 100).toFixed(0)}%`;
    if (story.entries.length >= 8) return `${actorNames} — ${story.entries.length}-event saga`;
    return `${actorNames} — legendary world event`;
  }

  private buildExcellentReason(story: RecordedStory): string {
    const duration = story.endTime - story.startTime;
    if (duration > 600) return `Extended ${story.entries.length}-event story`;
    if (story.peakTension > 85) return `High tension peak: ${story.peakTension.toFixed(0)}%`;
    return `Significant multi-event narrative`;
  }

  private buildGoodReason(story: RecordedStory): string {
    if (story.entries.length >= 5) return `${story.entries.length}-event arc`;
    if (story.peakTension > 75) return `Tension spike to ${story.peakTension.toFixed(0)}%`;
    return `Notable development`;
  }

  getCandidates(): HighlightCandidate[] {
    return this.candidates;
  }

  getUnrendered(): HighlightCandidate[] {
    return this.candidates.filter((c) => !c.rendered);
  }

  getByTier(tier: HighlightTier): HighlightCandidate[] {
    return this.candidates.filter((c) => c.tier === tier);
  }

  markRendered(storyId: string): void {
    const c = this.candidates.find((c) => c.storyId === storyId);
    if (c) c.rendered = true;
  }

  markExported(storyId: string): void {
    const c = this.candidates.find((c) => c.storyId === storyId);
    if (c) c.exported = true;
  }

  getStats(): {
    total: number;
    byTier: Record<HighlightTier, number>;
    rendered: number;
    exported: number;
  } {
    const byTier: Record<HighlightTier, number> = { legendary: 0, excellent: 0, good: 0, normal: 0, archive: 0 };
    for (const c of this.candidates) byTier[c.tier]++;
    return {
      total: this.candidates.length,
      byTier,
      rendered: this.candidates.filter((c) => c.rendered).length,
      exported: this.candidates.filter((c) => c.exported).length,
    };
  }

  cleanup(maxAge: number = 604800000): number {
    const cutoff = Date.now() - maxAge;
    const before = this.candidates.length;
    this.candidates = this.candidates.filter((c) => c.detectedAt > cutoff);
    return before - this.candidates.length;
  }
}
