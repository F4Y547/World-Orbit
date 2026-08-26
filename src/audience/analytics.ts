import type { CitizenProfile } from './citizen';
import type { PredictionStore } from './prediction';
import type { Leaderboard } from './leaderboard';
import type { VotingSystem } from './voting';

export interface AudienceMetrics {
  timestamp: number;
  liveViewers: number;
  activePredictors: number;
  predictionsPerMinute: number;
  overallAccuracy: number;
  citizenParticipation: number;
  totalCitizens: number;
  activeCitizens: number;
  averageSessionMinutes: number;
  retentionRate: number;
  peakConcurrentPredictors: number;
  votesPerMinute: number;
  currentPrediction: {
    title: string;
    options: Array<{ label: string; percentage: number }>;
  } | null;
  currentVote: {
    title: string;
    options: Array<{ label: string; percentage: number }>;
  } | null;
}

export interface EngagementEvent {
  timestamp: number;
  type: 'prediction' | 'vote' | 'command' | 'join' | 'leave';
  citizenId: string;
  detail: string;
}

export interface RetentionData {
  day: number;
  returningCitizens: number;
  newCitizens: number;
  churnedCitizens: number;
  retentionRate: number;
}

export class AudienceAnalytics {
  private engagementLog: EngagementEvent[] = [];
  private metricsHistory: AudienceMetrics[] = [];
  private joinTimes: Map<string, number> = new Map();
  private sessionDurations: number[] = [];
  private predictionTimestamps: number[] = [];
  private voteTimestamps: number[] = [];
  private peakConcurrent = 0;
  private currentConcurrent = 0;
  private maxLogSize = 10000;
  private maxHistorySize = 8640;

  recordEngagement(event: EngagementEvent): void {
    this.engagementLog.push(event);
    if (this.engagementLog.length > this.maxLogSize) {
      this.engagementLog.shift();
    }

    if (event.type === 'prediction') {
      this.predictionTimestamps.push(event.timestamp);
    }
    if (event.type === 'vote') {
      this.voteTimestamps.push(event.timestamp);
    }
  }

  recordJoin(citizenId: string): void {
    this.joinTimes.set(citizenId, Date.now());
    this.currentConcurrent++;
    this.peakConcurrent = Math.max(this.peakConcurrent, this.currentConcurrent);
  }

  recordLeave(citizenId: string): void {
    const joinTime = this.joinTimes.get(citizenId);
    if (joinTime) {
      this.sessionDurations.push(Date.now() - joinTime);
      if (this.sessionDurations.length > 1000) this.sessionDurations.shift();
      this.joinTimes.delete(citizenId);
      this.currentConcurrent = Math.max(0, this.currentConcurrent - 1);
    }
  }

  collectMetrics(
    leaderboard: Leaderboard,
    predictionStore: PredictionStore,
    votingSystem: VotingSystem,
  ): AudienceMetrics {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;

    const recentPredictions = this.predictionTimestamps.filter((t) => t > oneMinuteAgo).length;
    const recentVotes = this.voteTimestamps.filter((t) => t > oneMinuteAgo).length;

    this.predictionTimestamps = this.predictionTimestamps.filter((t) => t > oneHourAgo);
    this.voteTimestamps = this.voteTimestamps.filter((t) => t > oneHourAgo);

    const allCitizens = leaderboard.getAllCitizens();
    const activeCitizens = allCitizens.filter((c) => c.lastActiveAt > oneDayAgo);
    const avgSessionMinutes = this.sessionDurations.length > 0
      ? this.sessionDurations.reduce((s, d) => s + d, 0) / this.sessionDurations.length / 60000
      : 0;

    let totalPredictions = 0;
    let correctPredictions = 0;
    for (const c of allCitizens) {
      totalPredictions += c.predictionsMade;
      correctPredictions += c.predictionsCorrect;
    }

    let activePredictors = 0;
    for (const c of allCitizens) {
      if (c.recentPredictions.some((p) => now - p.timestamp < 3600000)) {
        activePredictors++;
      }
    }

    const activeVotes = votingSystem.getActiveVotes();
    let currentPrediction = null;
    let currentVote = null;

    if (activeVotes.length > 0) {
      const v = activeVotes[0];
      const total = v.totalVotes || 1;
      currentVote = {
        title: v.title,
        options: v.options.map((o) => ({
          label: `${o.icon} ${o.label}`,
          percentage: Math.round((o.votes / total) * 100),
        })),
      };
    }

    const metrics: AudienceMetrics = {
      timestamp: now,
      liveViewers: this.currentConcurrent,
      activePredictors,
      predictionsPerMinute: recentPredictions,
      overallAccuracy: totalPredictions > 0 ? correctPredictions / totalPredictions : 0,
      citizenParticipation: allCitizens.length > 0 ? activeCitizens.length / allCitizens.length : 0,
      totalCitizens: allCitizens.length,
      activeCitizens: activeCitizens.length,
      averageSessionMinutes: avgSessionMinutes,
      retentionRate: 0,
      peakConcurrentPredictors: this.peakConcurrent,
      votesPerMinute: recentVotes,
      currentPrediction,
      currentVote,
    };

    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }

    return metrics;
  }

  getMetricsHistory(): AudienceMetrics[] {
    return this.metricsHistory;
  }

  getEngagementByType(windowMs: number = 3600000): Record<string, number> {
    const cutoff = Date.now() - windowMs;
    const counts: Record<string, number> = {};
    for (const event of this.engagementLog) {
      if (event.timestamp > cutoff) {
        counts[event.type] = (counts[event.type] ?? 0) + 1;
      }
    }
    return counts;
  }

  getEngagementTimeline(bucketMs: number = 300000): Array<{ time: number; count: number; types: Record<string, number> }> {
    const now = Date.now();
    const buckets: Array<{ time: number; count: number; types: Record<string, number> }> = [];

    for (let t = now - 3600000; t <= now; t += bucketMs) {
      const types: Record<string, number> = {};
      let count = 0;
      for (const event of this.engagementLog) {
        if (event.timestamp >= t && event.timestamp < t + bucketMs) {
          types[event.type] = (types[event.type] ?? 0) + 1;
          count++;
        }
      }
      buckets.push({ time: t, count, types });
    }

    return buckets;
  }

  getPeakHours(): Array<{ hour: number; avgEngagement: number }> {
    const hourly = new Map<number, number[]>();
    for (const event of this.engagementLog) {
      const hour = new Date(event.timestamp).getHours();
      const counts = hourly.get(hour) ?? [];
      counts.push(1);
      hourly.set(hour, counts);
    }

    return Array.from(hourly.entries())
      .map(([hour, counts]) => ({
        hour,
        avgEngagement: counts.reduce((s, c) => s + c, 0) / Math.max(1, counts.length),
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);
  }

  correlateEventEngagement(eventKind: string): {
    predictionsBefore: number;
    predictionsAfter: number;
    votesBefore: number;
    votesAfter: number;
  } {
    const windowMs = 300000;
    const events = this.engagementLog.filter((e) => e.detail.includes(eventKind));
    if (events.length === 0) return { predictionsBefore: 0, predictionsAfter: 0, votesBefore: 0, votesAfter: 0 };

    const latestEvent = events[events.length - 1];
    const before = this.engagementLog.filter(
      (e) => e.timestamp >= latestEvent.timestamp - windowMs && e.timestamp < latestEvent.timestamp
    );
    const after = this.engagementLog.filter(
      (e) => e.timestamp >= latestEvent.timestamp && e.timestamp < latestEvent.timestamp + windowMs
    );

    return {
      predictionsBefore: before.filter((e) => e.type === 'prediction').length,
      predictionsAfter: after.filter((e) => e.type === 'prediction').length,
      votesBefore: before.filter((e) => e.type === 'vote').length,
      votesAfter: after.filter((e) => e.type === 'vote').length,
    };
  }
}
