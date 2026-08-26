import type { WorldState } from '../sim/types';

export interface EmergencyCommand {
  type: 'pause' | 'resume' | 'speed' | 'restart' | 'snapshot' | 'rollback' | 'replay' | 'emergency-calm' | 'emergency-event' | 'clear-queue' | 'audio' | 'broadcast';
  value?: string;
  timestamp: number;
}

export interface EmergencyState {
  isPaused: boolean;
  speed: number;
  lastCommand: EmergencyCommand | null;
  commandHistory: EmergencyCommand[];
  emergencyCalmActive: boolean;
  emergencyCalmExpiry: number;
}

export interface BroadcastMetrics {
  uptimeMs: number;
  cpuPercent: number;
  memoryMB: number;
  fps: number;
  tickLatencyMs: number;
  eventRatePerMin: number;
  storyRatePerHour: number;
  replayQueueSize: number;
  contentQueueSize: number;
  audienceActive: number;
  predictionActivity: number;
  errorCount: number;
  recoveryCount: number;
  healthScore: number;
  broadcastHealth: string;
}

export class EmergencyControls {
  private state: EmergencyState;
  private metrics: BroadcastMetrics;

  constructor() {
    this.state = {
      isPaused: false,
      speed: 1,
      lastCommand: null,
      commandHistory: [],
      emergencyCalmActive: false,
      emergencyCalmExpiry: 0,
    };
    this.metrics = {
      uptimeMs: 0,
      cpuPercent: 0,
      memoryMB: 0,
      fps: 60,
      tickLatencyMs: 0,
      eventRatePerMin: 0,
      storyRatePerHour: 0,
      replayQueueSize: 0,
      contentQueueSize: 0,
      audienceActive: 0,
      predictionActivity: 0,
      errorCount: 0,
      recoveryCount: 0,
      healthScore: 100,
      broadcastHealth: '🟢 BROADCAST HEALTH: 100%',
    };
  }

  execute(command: EmergencyCommand, world?: WorldState): string {
    this.state.lastCommand = command;
    this.state.commandHistory.push(command);
    if (this.state.commandHistory.length > 100) this.state.commandHistory.shift();

    switch (command.type) {
      case 'pause':
        if (world) world.paused = true;
        this.state.isPaused = true;
        return 'Paused';

      case 'resume':
        if (world) world.paused = false;
        this.state.isPaused = false;
        return 'Resumed';

      case 'speed':
        if (command.value && world) {
          const s = parseFloat(command.value);
          if (s >= 0.25 && s <= 4) {
            world.speedMultiplier = s;
            this.state.speed = s;
            return `Speed set to ${s}x`;
          }
        }
        return 'Invalid speed';

      case 'snapshot':
        return 'Snapshot triggered (manual)';

      case 'emergency-calm':
        this.state.emergencyCalmActive = true;
        this.state.emergencyCalmExpiry = Date.now() + 300000;
        return 'Emergency calm active for 5 minutes';

      case 'emergency-event':
        return 'Emergency event triggered (testing only)';

      case 'clear-queue':
        return 'Queue cleared';

      case 'replay':
        return 'Replay mode triggered';

      case 'audio':
        return 'Audio toggled';

      case 'broadcast':
        return 'Broadcast toggled';

      default:
        return 'Unknown command';
    }
  }

  isCalmActive(): boolean {
    if (!this.state.emergencyCalmActive) return false;
    if (Date.now() > this.state.emergencyCalmExpiry) {
      this.state.emergencyCalmActive = false;
      return false;
    }
    return true;
  }

  updateMetrics(partial: Partial<BroadcastMetrics>): void {
    Object.assign(this.state, partial);
    Object.assign(this.metrics, partial);
    this.metrics.healthScore = this.calculateHealth();
    this.metrics.broadcastHealth = this.formatHealth();
  }

  private calculateHealth(): number {
    let score = 100;
    if (this.metrics.fps < 30) score -= 20;
    else if (this.metrics.fps < 50) score -= 10;
    if (this.metrics.memoryMB > 200) score -= 15;
    else if (this.metrics.memoryMB > 150) score -= 5;
    if (this.metrics.tickLatencyMs > 16) score -= 15;
    else if (this.metrics.tickLatencyMs > 10) score -= 5;
    if (this.metrics.errorCount > 10) score -= 20;
    else if (this.metrics.errorCount > 5) score -= 10;
    return Math.max(0, Math.min(100, score));
  }

  private formatHealth(): string {
    const s = this.metrics.healthScore;
    const icon = s >= 80 ? '🟢' : s >= 50 ? '🟡' : '🔴';
    return `${icon} BROADCAST HEALTH: ${s.toFixed(1)}%`;
  }

  getState(): EmergencyState {
    return { ...this.state };
  }

  getMetrics(): BroadcastMetrics {
    return { ...this.metrics };
  }

  getCommandHistory(): EmergencyCommand[] {
    return [...this.state.commandHistory];
  }

  reset(): void {
    this.state = {
      isPaused: false,
      speed: 1,
      lastCommand: null,
      commandHistory: [],
      emergencyCalmActive: false,
      emergencyCalmExpiry: 0,
    };
  }
}
