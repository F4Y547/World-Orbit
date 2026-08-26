import type { WorldState } from '../sim/types';

export type BroadcastPhase =
  | 'boot'
  | 'world-load'
  | 'health-check'
  | 'broadcast-start'
  | 'running'
  | 'degraded'
  | 'recovery'
  | 'shutdown';

export type BroadcastMode =
  | 'live'
  | 'active-story'
  | 'calm'
  | 'anticipation'
  | 'major-event'
  | 'replay'
  | 'recovery';

export interface BroadcastState {
  phase: BroadcastPhase;
  mode: BroadcastMode;
  uptime: number;
  startTime: number;
  lastHealthCheck: number;
  lastError: string | null;
  recoveryAttempts: number;
  maxRecoveryAttempts: number;
  healthScore: number;
  consecutiveErrors: number;
  fps: number;
  memoryMB: number;
  tickMs: number;
  eventRate: number;
  storyRate: number;
  activeWars: number;
  viewerCount: number;
}

export interface HealthCheckResult {
  healthy: boolean;
  fps: boolean;
  memory: boolean;
  tick: boolean;
  renderer: boolean;
  audio: boolean;
  storyEngine: boolean;
  camera: boolean;
  errors: string[];
}

export interface BroadcastEvent {
  type: string;
  time: number;
  detail: string;
}

export class BroadcastController {
  private state: BroadcastState;
  private eventLog: BroadcastEvent[] = [];
  private onPhaseChange: ((phase: BroadcastPhase, prev: BroadcastPhase) => void) | null = null;
  private onModeChange: ((mode: BroadcastMode, prev: BroadcastMode) => void) | null = null;
  private recoveryStrategy: ((state: BroadcastState, errors: string[]) => boolean) | null = null;

  constructor() {
    const now = Date.now();
    this.state = {
      phase: 'boot',
      mode: 'live',
      uptime: 0,
      startTime: now,
      lastHealthCheck: now,
      lastError: null,
      recoveryAttempts: 0,
      maxRecoveryAttempts: 5,
      healthScore: 100,
      consecutiveErrors: 0,
      fps: 60,
      memoryMB: 0,
      tickMs: 0,
      eventRate: 0,
      storyRate: 0,
      activeWars: 0,
      viewerCount: 0,
    };
  }

  setPhaseChangeCallback(cb: (phase: BroadcastPhase, prev: BroadcastPhase) => void): void {
    this.onPhaseChange = cb;
  }

  setModeChangeCallback(cb: (mode: BroadcastMode, prev: BroadcastMode) => void): void {
    this.onModeChange = cb;
  }

  setRecoveryStrategy(strategy: (state: BroadcastState, errors: string[]) => boolean): void {
    this.recoveryStrategy = strategy;
  }

  transitionPhase(next: BroadcastPhase): void {
    const prev = this.state.phase;
    if (prev === next) return;
    this.state.phase = next;
    this.logEvent('phase-change', `${prev} → ${next}`);
    this.onPhaseChange?.(next, prev);
  }

  transitionMode(next: BroadcastMode): void {
    const prev = this.state.mode;
    if (prev === next) return;
    this.state.mode = next;
    this.logEvent('mode-change', `${prev} → ${next}`);
    this.onModeChange?.(next, prev);
  }

  async boot(w: WorldState): Promise<boolean> {
    this.transitionPhase('boot');
    this.logEvent('boot', `Starting with seed ${w.seed}`);

    this.transitionPhase('world-load');
    this.logEvent('world-load', `World loaded: day ${w.day}, ${w.countries.length} countries`);

    this.transitionPhase('health-check');
    const health = this.runHealthCheck(w);
    if (!health.healthy) {
      this.logEvent('health-warn', `Initial health check: ${health.errors.join(', ')}`);
    }

    this.transitionPhase('broadcast-start');
    this.logEvent('broadcast-start', 'Broadcast starting');
    this.transitionPhase('running');

    return true;
  }

  runHealthCheck(w: WorldState): HealthCheckResult {
    const now = Date.now();
    this.state.lastHealthCheck = now;
    this.state.uptime = now - this.state.startTime;

    const errors: string[] = [];
    const fps = this.state.fps >= 30;
    const memory = this.state.memoryMB <= 200;
    const tick = this.state.tickMs <= 16;
    const renderer = true;
    const audio = true;
    const storyEngine = w.story.chains.length + w.story.mysteries.length < 10;
    const camera = true;

    if (!fps) errors.push('Low FPS');
    if (!memory) errors.push('High memory');
    if (!tick) errors.push('Slow ticks');
    if (!storyEngine) errors.push('Story engine overloaded');

    const healthy = errors.length === 0;
    this.state.healthScore = healthy ? 100 : Math.max(0, 100 - errors.length * 15);

    return { healthy, fps, memory, tick, renderer, audio, storyEngine, camera, errors };
  }

  updateMetrics(w: WorldState, fps: number, tickMs: number, memoryMB: number): void {
    this.state.fps = fps;
    this.state.tickMs = tickMs;
    this.state.memoryMB = memoryMB;

    let activeWars = 0;
    for (const war of w.wars.values()) {
      if (!war.outcome) activeWars++;
    }
    this.state.activeWars = activeWars;

    this.state.eventRate = w.news.length / Math.max(1, w.time / 60);
  }

  handleError(error: string): void {
    this.state.lastError = error;
    this.state.consecutiveErrors++;
    this.logEvent('error', error);

    if (this.state.consecutiveErrors >= 3) {
      this.transitionPhase('degraded');
    }

    if (this.state.consecutiveErrors >= this.state.maxRecoveryAttempts) {
      this.attemptRecovery();
    }
  }

  clearError(): void {
    this.state.consecutiveErrors = 0;
    this.state.lastError = null;
    if (this.state.phase === 'degraded') {
      this.transitionPhase('running');
    }
  }

  private attemptRecovery(): void {
    this.transitionPhase('recovery');
    this.state.recoveryAttempts++;
    this.logEvent('recovery', `Recovery attempt ${this.state.recoveryAttempts}`);

    if (this.recoveryStrategy) {
      const success = this.recoveryStrategy(this.state, [this.state.lastError ?? 'unknown']);
      if (success) {
        this.state.consecutiveErrors = 0;
        this.state.lastError = null;
        this.transitionPhase('running');
        this.logEvent('recovery-success', 'Recovery successful');
      } else {
        this.logEvent('recovery-failed', 'Recovery failed');
        if (this.state.recoveryAttempts >= this.state.maxRecoveryAttempts) {
          this.transitionPhase('shutdown');
          this.logEvent('shutdown', 'Max recovery attempts reached');
        }
      }
    } else {
      this.state.consecutiveErrors = 0;
      this.transitionPhase('running');
    }
  }

  private logEvent(type: string, detail: string): void {
    this.eventLog.push({ type, time: Date.now(), detail });
    if (this.eventLog.length > 500) this.eventLog.shift();
  }

  getState(): BroadcastState {
    return { ...this.state };
  }

  getEventLog(): BroadcastEvent[] {
    return this.eventLog;
  }

  isRunning(): boolean {
    return this.state.phase === 'running' || this.state.phase === 'degraded';
  }

  getHealthPercentage(): number {
    return this.state.healthScore;
  }

  getStatusLine(): string {
    const uptimeH = Math.floor(this.state.uptime / 3600000);
    const uptimeM = Math.floor((this.state.uptime % 3600000) / 60000);
    const health = this.state.healthScore >= 80 ? '🟢' : this.state.healthScore >= 50 ? '🟡' : '🔴';
    return `${health} BROADCAST: ${this.state.phase.toUpperCase()} | Mode: ${this.state.mode} | Uptime: ${uptimeH}h ${uptimeM}m | Health: ${this.state.healthScore}%`;
  }

  reset(): void {
    const now = Date.now();
    this.state = {
      phase: 'boot',
      mode: 'live',
      uptime: 0,
      startTime: now,
      lastHealthCheck: now,
      lastError: null,
      recoveryAttempts: 0,
      maxRecoveryAttempts: 5,
      healthScore: 100,
      consecutiveErrors: 0,
      fps: 60,
      memoryMB: 0,
      tickMs: 0,
      eventRate: 0,
      storyRate: 0,
      activeWars: 0,
      viewerCount: 0,
    };
    this.eventLog = [];
  }
}
