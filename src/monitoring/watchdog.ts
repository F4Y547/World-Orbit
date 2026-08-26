import type { WorldState } from '../sim/types';

export interface WatchdogAlert {
  source: string;
  severity: 'info' | 'warn' | 'critical';
  message: string;
  timestamp: number;
  action?: string;
}

export class EventWatchdog {
  private lastEventTime = 0;
  private eventCount = 0;
  private recentEventKinds: string[] = [];

  check(w: WorldState): WatchdogAlert | null {
    const latest = w.news[w.news.length - 1];
    if (latest && latest.time !== this.lastEventTime) {
      this.lastEventTime = latest.time;
      this.eventCount++;
      this.recentEventKinds.push(latest.kind);
      if (this.recentEventKinds.length > 20) this.recentEventKinds.shift();
    }

    const timeSinceEvent = w.time - this.lastEventTime;
    if (timeSinceEvent > 300 && w.time > 100) {
      return {
        source: 'event-watchdog',
        severity: 'warn',
        message: `No events for ${timeSinceEvent.toFixed(0)}s`,
        timestamp: w.time,
        action: 'Force a story event',
      };
    }

    if (this.recentEventKinds.length >= 10) {
      const last10 = this.recentEventKinds.slice(-10);
      const unique = new Set(last10);
      if (unique.size <= 2) {
        return {
          source: 'event-watchdog',
          severity: 'critical',
          message: `Event loop detected: only ${unique.size} unique kinds in last 10 events`,
          timestamp: w.time,
          action: 'Force diverse event types',
        };
      }
    }

    return null;
  }

  reset(): void {
    this.lastEventTime = 0;
    this.eventCount = 0;
    this.recentEventKinds = [];
  }
}

export class StoryWatchdog {
  private storyStartTimes: Map<string, number> = new Map();
  private maxStoryDuration = 1800;

  check(w: WorldState): WatchdogAlert | null {
    for (const chain of w.story.chains) {
      if (!this.storyStartTimes.has(chain.label)) {
        this.storyStartTimes.set(chain.label, w.time);
      }
      const startTime = this.storyStartTimes.get(chain.label)!;
      const duration = w.time - startTime;

      if (duration > this.maxStoryDuration) {
        return {
          source: 'story-watchdog',
          severity: 'critical',
          message: `Story "${chain.label}" stuck in phase ${chain.idx}/${chain.steps.length} for ${duration.toFixed(0)}s`,
          timestamp: w.time,
          action: 'Force story resolution',
        };
      }
    }

    for (const mystery of w.story.mysteries) {
      if (!this.storyStartTimes.has(mystery.label)) {
        this.storyStartTimes.set(mystery.label, w.time);
      }
      const startTime = this.storyStartTimes.get(mystery.label)!;
      const duration = w.time - startTime;

      if (duration > this.maxStoryDuration) {
        return {
          source: 'story-watchdog',
          severity: 'critical',
          message: `Mystery "${mystery.label}" unresolved for ${duration.toFixed(0)}s`,
          timestamp: w.time,
          action: 'Force mystery resolution',
        };
      }
    }

    for (const [label] of this.storyStartTimes) {
      const active = [...w.story.chains, ...w.story.mysteries].find((s) => s.label === label);
      if (!active) this.storyStartTimes.delete(label);
    }

    return null;
  }

  reset(): void {
    this.storyStartTimes.clear();
  }
}

export class CameraWatchdog {
  private lastTargetX = 0;
  private lastTargetY = 0;
  private lastChangeTime = 0;
  private unchangedDuration = 0;
  private interruptionCount = 0;

  check(w: WorldState, currentX: number, currentY: number): WatchdogAlert | null {
    const dx = currentX - this.lastTargetX;
    const dy = currentY - this.lastTargetY;
    const moved = Math.hypot(dx, dy) > 5;

    if (moved) {
      this.lastTargetX = currentX;
      this.lastTargetY = currentY;
      this.lastChangeTime = w.time;
      this.unchangedDuration = 0;
    } else {
      this.unchangedDuration = w.time - this.lastChangeTime;
    }

    if (this.unchangedDuration > 120) {
      return {
        source: 'camera-watchdog',
        severity: 'warn',
        message: `Camera unchanged for ${this.unchangedDuration.toFixed(0)}s`,
        timestamp: w.time,
        action: 'Reset to world overview',
      };
    }

    return null;
  }

  recordInterruption(): void {
    this.interruptionCount++;
  }

  reset(): void {
    this.lastTargetX = 0;
    this.lastTargetY = 0;
    this.lastChangeTime = 0;
    this.unchangedDuration = 0;
    this.interruptionCount = 0;
  }
}

export class BroadcastWatchdog {
  private lastFps = 60;
  private lowFpsDuration = 0;
  private renderErrors = 0;

  check(fps: number, memoryMB: number): WatchdogAlert | null {
    this.lastFps = fps;

    if (fps < 30) {
      this.lowFpsDuration++;
    } else {
      this.lowFpsDuration = 0;
    }

    if (this.lowFpsDuration > 300) {
      return {
        source: 'broadcast-watchdog',
        severity: 'critical',
        message: `Low FPS (${fps.toFixed(0)}) for ${this.lowFpsDuration} frames`,
        timestamp: performance.now() / 1000,
        action: 'Reinitialize renderer',
      };
    }

    if (memoryMB > 200) {
      return {
        source: 'broadcast-watchdog',
        severity: 'warn',
        message: `High memory: ${memoryMB.toFixed(1)}MB`,
        timestamp: performance.now() / 1000,
      };
    }

    return null;
  }

  recordRenderError(): void {
    this.renderErrors++;
  }

  reset(): void {
    this.lastFps = 60;
    this.lowFpsDuration = 0;
    this.renderErrors = 0;
  }
}
