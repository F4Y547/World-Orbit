import type { EventKind, WorldState } from '../sim/types';

export interface BoredomSnapshot {
  timestamp: number;
  simTime: number;
  timeSinceMajorEvent: number;
  timeSinceMinorEvent: number;
  recentEventDiversity: number;
  activeStoryCount: number;
  globalTension: number;
  cameraActivity: number;
  spectacleActivity: number;
  hookTriggered: boolean;
  hookType: string | null;
  hookLedToEvent: boolean;
}

export interface HookOutcome {
  hookType: string;
  hookTime: number;
  ledToEvent: boolean;
  eventTime?: number;
  eventType?: EventKind;
}

export class BoredomAnalytics {
  private snapshots: BoredomSnapshot[] = [];
  private hookOutcomes: HookOutcome[] = [];
  private lastMajorEventTime = 0;
  private lastMinorEventTime = 0;
  private cameraActivityCount = 0;
  private spectacleActivityCount = 0;
  private pendingHooks: Map<number, { type: string; time: number }> = new Map();

  recordEvent(w: WorldState, event: { kind: EventKind; time: number; spectacle?: { intensity: number } }): void {
    const isMajor = event.spectacle && event.spectacle.intensity > 0.5;
    if (isMajor) {
      this.lastMajorEventTime = event.time;
    }
    this.lastMinorEventTime = event.time;

    for (const [hookTime, hook] of this.pendingHooks) {
      if (event.time - hookTime < 120) {
        this.hookOutcomes.push({
          hookType: hook.type,
          hookTime,
          ledToEvent: true,
          eventTime: event.time,
          eventType: event.kind,
        });
        this.pendingHooks.delete(hookTime);
      }
    }
  }

  recordCameraActivity(): void {
    this.cameraActivityCount++;
  }

  recordSpectacleActivity(): void {
    this.spectacleActivityCount++;
  }

  recordHookTrigger(w: WorldState, hookType: string): void {
    this.pendingHooks.set(w.time, { type: hookType, time: w.time });
  }

  collect(w: WorldState): BoredomSnapshot {
    const now = w.time;
    const recentKinds = w.story.boredom.recentKinds;
    const uniqueKinds = new Set(recentKinds).size;
    const diversity = recentKinds.length > 0 ? uniqueKinds / recentKinds.length : 1;

    let totalTension = 0;
    let relCount = 0;
    for (const rel of w.relations.values()) {
      totalTension += rel.tension;
      relCount++;
    }
    const globalTension = relCount > 0 ? totalTension / relCount : 0;

    const snap: BoredomSnapshot = {
      timestamp: performance.now() / 1000,
      simTime: now,
      timeSinceMajorEvent: now - this.lastMajorEventTime,
      timeSinceMinorEvent: now - this.lastMinorEventTime,
      recentEventDiversity: diversity,
      activeStoryCount: w.story.chains.length + w.story.mysteries.length,
      globalTension,
      cameraActivity: this.cameraActivityCount,
      spectacleActivity: this.spectacleActivityCount,
      hookTriggered: w.story.boredom.hookActive,
      hookType: w.story.boredom.hookType,
      hookLedToEvent: false,
    };

    this.snapshots.push(snap);
    if (this.snapshots.length > 1000) this.snapshots.shift();

    return snap;
  }

  getHookOutcomeRate(): number {
    if (this.hookOutcomes.length === 0) return 0;
    const ledToEvent = this.hookOutcomes.filter((h) => h.ledToEvent).length;
    return ledToEvent / this.hookOutcomes.length;
  }

  getHookOutcomes(): HookOutcome[] {
    return this.hookOutcomes;
  }

  getSnapshots(): BoredomSnapshot[] {
    return this.snapshots;
  }

  identifyBadLoops(): string[] {
    const issues: string[] = [];
    const recent = this.snapshots.slice(-30);
    if (recent.length < 10) return issues;

    const avgTimeSinceMajor = recent.reduce((s, e) => s + e.timeSinceMajorEvent, 0) / recent.length;
    if (avgTimeSinceMajor > 600) {
      issues.push(`Major events too infrequent (avg ${avgTimeSinceMajor.toFixed(0)}s since last)`);
    }

    const avgDiversity = recent.reduce((s, e) => s + e.recentEventDiversity, 0) / recent.length;
    if (avgDiversity < 0.3) {
      issues.push(`Low event diversity (${(avgDiversity * 100).toFixed(0)}%)`);
    }

    const hookRate = recent.filter((e) => e.hookTriggered).length / recent.length;
    if (hookRate > 0.8) {
      issues.push(`Hooks firing too often (${(hookRate * 100).toFixed(0)}% of samples)`);
    }

    const outcomes = this.hookOutcomes.slice(-20);
    if (outcomes.length > 5) {
      const failRate = outcomes.filter((h) => !h.ledToEvent).length / outcomes.length;
      if (failRate > 0.7) {
        issues.push(`Most hooks don't lead to events (${(failRate * 100).toFixed(0)}% failure)`);
      }
    }

    return issues;
  }

  reset(): void {
    this.snapshots = [];
    this.hookOutcomes = [];
    this.lastMajorEventTime = 0;
    this.lastMinorEventTime = 0;
    this.cameraActivityCount = 0;
    this.spectacleActivityCount = 0;
    this.pendingHooks.clear();
  }
}
