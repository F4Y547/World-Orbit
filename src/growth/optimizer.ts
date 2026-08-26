import type { StoryTier } from '../sim/types';

export interface ContentMetrics {
  eventType: string;
  tier: StoryTier;
  score: number;
  replayLength: number;
  predictionParticipation: number;
  hookType: string;
  countries: string[];
  timestamp: number;
}

export interface OptimizationInsight {
  category: string;
  finding: string;
  recommendation: string;
  confidence: number;
  sampleSize: number;
}

export interface BestPerformers {
  bestEventTypes: { type: string; avgScore: number; count: number }[];
  bestHookTypes: { type: string; avgScore: number; count: number }[];
  bestDurations: { range: string; avgEngagement: number }[];
  bestCountries: { country: string; eventCount: number; avgScore: number }[];
  bestTierDistribution: { tier: string; percentage: number }[];
}

export class ContentOptimizer {
  private metrics: ContentMetrics[] = [];
  private maxMetrics = 1000;

  record(metrics: ContentMetrics): void {
    this.metrics.push(metrics);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
  }

  analyze(): BestPerformers {
    const byType = this.groupBy('eventType');
    const byHook = this.groupBy('hookType');
    const byTier = this.groupBy('tier');

    const bestEventTypes = Object.entries(byType)
      .map(([type, items]) => ({
        type,
        avgScore: items.reduce((s, m) => s + m.score, 0) / items.length,
        count: items.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 5);

    const bestHookTypes = Object.entries(byHook)
      .map(([type, items]) => ({
        type,
        avgScore: items.reduce((s, m) => s + m.score, 0) / items.length,
        count: items.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 5);

    const durationBuckets: Record<string, number[]> = {};
    for (const m of this.metrics) {
      const bucket = m.replayLength < 20 ? 'short' : m.replayLength < 60 ? 'medium' : 'long';
      if (!durationBuckets[bucket]) durationBuckets[bucket] = [];
      durationBuckets[bucket].push(m.predictionParticipation);
    }

    const bestDurations = Object.entries(durationBuckets)
      .map(([range, engagements]) => ({
        range,
        avgEngagement: engagements.reduce((s, e) => s + e, 0) / engagements.length,
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);

    const countryStats: Record<string, { count: number; totalScore: number }> = {};
    for (const m of this.metrics) {
      for (const c of m.countries) {
        if (!countryStats[c]) countryStats[c] = { count: 0, totalScore: 0 };
        countryStats[c].count++;
        countryStats[c].totalScore += m.score;
      }
    }

    const bestCountries = Object.entries(countryStats)
      .map(([country, stats]) => ({
        country,
        eventCount: stats.count,
        avgScore: stats.totalScore / stats.count,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 5);

    const total = this.metrics.length;
    const tierCounts: Record<string, number> = {};
    for (const m of this.metrics) {
      tierCounts[m.tier] = (tierCounts[m.tier] ?? 0) + 1;
    }
    const bestTierDistribution = Object.entries(tierCounts)
      .map(([tier, count]) => ({ tier, percentage: (count / total) * 100 }))
      .sort((a, b) => b.percentage - a.percentage);

    return { bestEventTypes, bestHookTypes, bestDurations, bestCountries, bestTierDistribution };
  }

  getInsights(): OptimizationInsight[] {
    const analysis = this.analyze();
    const insights: OptimizationInsight[] = [];

    if (analysis.bestEventTypes.length > 0) {
      const best = analysis.bestEventTypes[0];
      insights.push({
        category: 'event-type',
        finding: `${best.type} events average score ${best.avgScore.toFixed(1)} (n=${best.count})`,
        recommendation: `Prioritize ${best.type} events in story scheduling`,
        confidence: Math.min(1, best.count / 20),
        sampleSize: best.count,
      });
    }

    if (analysis.bestHookTypes.length > 0) {
      const best = analysis.bestHookTypes[0];
      insights.push({
        category: 'hook-type',
        finding: `${best.type} hooks average score ${best.avgScore.toFixed(1)} (n=${best.count})`,
        recommendation: `Use ${best.type} hooks in content packaging`,
        confidence: Math.min(1, best.count / 20),
        sampleSize: best.count,
      });
    }

    if (analysis.bestDurations.length > 0) {
      const best = analysis.bestDurations[0];
      insights.push({
        category: 'duration',
        finding: `${best.range} replays get ${best.avgEngagement.toFixed(1)} avg engagement`,
        recommendation: `Target ${best.range} replay duration`,
        confidence: Math.min(1, this.metrics.length / 50),
        sampleSize: this.metrics.length,
      });
    }

    return insights;
  }

  private groupBy(key: keyof ContentMetrics): Record<string, ContentMetrics[]> {
    const groups: Record<string, ContentMetrics[]> = {};
    for (const m of this.metrics) {
      const val = String(m[key]);
      if (!groups[val]) groups[val] = [];
      groups[val].push(m);
    }
    return groups;
  }

  getMetricsCount(): number {
    return this.metrics.length;
  }

  getRecentMetrics(count: number): ContentMetrics[] {
    return this.metrics.slice(-count);
  }

  reset(): void {
    this.metrics = [];
  }
}
