import type { ArchivedStory } from './archive';
import type { QueueItem } from './queue';
import type { HighlightCandidate } from './highlightDetector';

export interface ContentMetrics {
  timestamp: number;
  storiesGenerated: number;
  storiesAbove80: number;
  storiesAbove90: number;
  replaysCreated: number;
  shortsCreated: number;
  averageReplayDuration: number;
  bestEventType: string;
  bestHookType: string;
  bestCountries: Array<{ country: string; count: number; avgScore: number }>;
  bestPredictionEvent: string;
  viewerConversion: number;
  totalViews: number;
  exportRate: number;
}

export interface ContentAnalyticsStore {
  metrics: ContentMetrics[];
  eventEngagement: Map<string, { views: number; predictions: number; shares: number }>;
  hookPerformance: Map<string, { used: number; engagement: number }>;
  countryPerformance: Map<string, { appearances: number; avgScore: number; totalViews: number }>;
}

export function createAnalyticsStore(): ContentAnalyticsStore {
  return {
    metrics: [],
    eventEngagement: new Map(),
    hookPerformance: new Map(),
    countryPerformance: new Map(),
  };
}

export function collectContentMetrics(
  store: ContentAnalyticsStore,
  stories: ArchivedStory[],
  queue: QueueItem[],
  highlights: HighlightCandidate[],
): ContentMetrics {
  const now = Date.now();
  const oneDay = 86400000;
  const recentStories = stories.filter((s) => now - s.archivedAt < oneDay * 7);

  let storiesAbove80 = 0;
  let storiesAbove90 = 0;
  let totalReplayDuration = 0;
  let replaysCreated = 0;
  let shortsCreated = 0;
  let totalViews = 0;

  const eventTypeCounts = new Map<string, { count: number; totalScore: number }>();
  const countryStats = new Map<string, { count: number; totalScore: number; views: number }>();

  for (const s of recentStories) {
    if (s.story.storyScore >= 80) storiesAbove80++;
    if (s.story.storyScore >= 90) storiesAbove90++;
    totalViews += s.viewCount;

    if (s.replay) {
      replaysCreated++;
      totalReplayDuration += s.replay.duration;
    }

    for (const actor of s.story.actors) {
      const existing = countryStats.get(actor) ?? { count: 0, totalScore: 0, views: 0 };
      existing.count++;
      existing.totalScore += s.story.storyScore;
      existing.views += s.viewCount;
      countryStats.set(actor, existing);
    }

    const lastEntry = s.story.entries[s.story.entries.length - 1];
    if (lastEntry) {
      const existing = eventTypeCounts.get(lastEntry.kind) ?? { count: 0, totalScore: 0 };
      existing.count++;
      existing.totalScore += s.story.storyScore;
      eventTypeCounts.set(lastEntry.kind, existing);
    }
  }

  const bestCountries = Array.from(countryStats.entries())
    .map(([country, stats]) => ({
      country,
      count: stats.count,
      avgScore: stats.totalScore / Math.max(1, stats.count),
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 5);

  let bestEventType = '';
  let bestEventScore = 0;
  for (const [kind, stats] of eventTypeCounts) {
    const avg = stats.totalScore / Math.max(1, stats.count);
    if (avg > bestEventScore) {
      bestEventScore = avg;
      bestEventType = kind;
    }
  }

  const exported = queue.filter((i) => i.status === 'exported').length;
  const exportRate = queue.length > 0 ? exported / queue.length : 0;

  const metrics: ContentMetrics = {
    timestamp: now,
    storiesGenerated: recentStories.length,
    storiesAbove80,
    storiesAbove90,
    replaysCreated,
    shortsCreated,
    averageReplayDuration: replaysCreated > 0 ? totalReplayDuration / replaysCreated : 0,
    bestEventType,
    bestHookType: '',
    bestCountries,
    bestPredictionEvent: bestEventType,
    viewerConversion: 0,
    totalViews,
    exportRate,
  };

  store.metrics.push(metrics);
  if (store.metrics.length > 1000) store.metrics.shift();

  return metrics;
}

export function trackHookPerformance(store: ContentAnalyticsStore, hook: string, engagement: number): void {
  const existing = store.hookPerformance.get(hook) ?? { used: 0, engagement: 0 };
  existing.used++;
  existing.engagement += engagement;
  store.hookPerformance.set(hook, existing);
}

export function trackCountryPerformance(store: ContentAnalyticsStore, country: string, score: number, views: number): void {
  const existing = store.countryPerformance.get(country) ?? { appearances: 0, avgScore: 0, totalViews: 0 };
  const totalScore = existing.avgScore * existing.appearances + score;
  existing.appearances++;
  existing.avgScore = totalScore / existing.appearances;
  existing.totalViews += views;
  store.countryPerformance.set(country, existing);
}

export function getBestHooks(store: ContentAnalyticsStore, limit: number = 5): Array<{ hook: string; engagement: number }> {
  return Array.from(store.hookPerformance.entries())
    .map(([hook, perf]) => ({
      hook,
      engagement: perf.engagement / Math.max(1, perf.used),
    }))
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, limit);
}

export function getBestCountries(store: ContentAnalyticsStore, limit: number = 5): Array<{ country: string; avgScore: number; appearances: number }> {
  return Array.from(store.countryPerformance.entries())
    .map(([country, perf]) => ({
      country,
      avgScore: perf.avgScore,
      appearances: perf.appearances,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, limit);
}

export function getMetricsHistory(store: ContentAnalyticsStore): ContentMetrics[] {
  return store.metrics;
}
