import type { StoryTier } from '../sim/types';

const TIER_ORDER: StoryTier[] = ['common', 'uncommon', 'rare', 'legendary'];

const COOLDOWN_SECONDS: Record<StoryTier, number> = {
  common: 0,
  uncommon: 0,
  rare: 60,
  legendary: 180,
};

const MIN_GAP_BETWEEN_EVENTS = 15;
const MAX_CALM_DURATION = 240;
const TENSION_BUILDUP_MIN = 60;
const TENSION_BUILDUP_MAX = 180;

export interface PacingState {
  lastEventTime: number;
  lastEventTier: StoryTier;
  cooldownRemaining: number;
  currentPhase: 'calm' | 'building' | 'climax' | 'cooldown' | 'aftermath';
  phaseStartTime: number;
  timeInPhase: number;
  eventsSinceLastMajor: number;
  tensionLevel: number;
  calmDuration: number;
  lastClimaxTime: number;
  consecutiveMinorEvents: number;
  totalEvents: number;
}

export interface PacingDecision {
  allowEvent: boolean;
  targetTier: StoryTier | null;
  phase: PacingState['currentPhase'];
  tensionTarget: number;
  reason: string;
  waitTime: number;
}

export class PacingEngine {
  private state: PacingState;

  constructor() {
    this.state = {
      lastEventTime: -999,
      lastEventTier: 'common',
      cooldownRemaining: 0,
      currentPhase: 'calm',
      phaseStartTime: 0,
      timeInPhase: 0,
      eventsSinceLastMajor: 0,
      tensionLevel: 0,
      calmDuration: 0,
      lastClimaxTime: -999,
      consecutiveMinorEvents: 0,
      totalEvents: 0,
    };
  }

  onEvent(time: number, tier: StoryTier): void {
    const tierRank = TIER_ORDER.indexOf(tier);
    const prevRank = TIER_ORDER.indexOf(this.state.lastEventTier);

    this.state.lastEventTime = time;
    this.state.lastEventTier = tier;
    this.state.totalEvents++;

    const cooldown = COOLDOWN_SECONDS[tier];
    this.state.cooldownRemaining = cooldown;

    if (tierRank >= TIER_ORDER.indexOf('legendary')) {
      this.state.currentPhase = 'climax';
      this.state.lastClimaxTime = time;
      this.state.eventsSinceLastMajor = 0;
      this.state.consecutiveMinorEvents = 0;
    } else if (tierRank >= TIER_ORDER.indexOf('rare')) {
      this.state.currentPhase = 'aftermath';
      this.state.eventsSinceLastMajor++;
    } else {
      this.state.consecutiveMinorEvents++;
      if (this.state.consecutiveMinorEvents >= 5) {
        this.state.currentPhase = 'cooldown';
      } else {
        this.state.eventsSinceLastMajor++;
      }
    }
    this.state.phaseStartTime = time;
  }

  decide(time: number, preferredTier: StoryTier | null): PacingDecision {
    this.state.timeInPhase = time - this.state.phaseStartTime;
    this.state.calmDuration = time - this.state.lastEventTime;

    if (this.state.cooldownRemaining > 0) {
      const elapsed = time - this.state.lastEventTime;
      if (elapsed < this.state.cooldownRemaining) {
        return {
          allowEvent: false,
          targetTier: null,
          phase: this.state.currentPhase,
          tensionTarget: this.state.tensionLevel,
          reason: `Cooldown active: ${Math.ceil(this.state.cooldownRemaining - elapsed)}s remaining`,
          waitTime: this.state.cooldownRemaining - elapsed,
        };
      }
      this.state.cooldownRemaining = 0;
    }

    if (this.state.calmDuration < MIN_GAP_BETWEEN_EVENTS) {
      return {
        allowEvent: false,
        targetTier: null,
        phase: this.state.currentPhase,
        tensionTarget: this.state.tensionLevel,
        reason: 'Minimum gap between events',
        waitTime: MIN_GAP_BETWEEN_EVENTS - this.state.calmDuration,
      };
    }

    this.updatePhase(time);

    const maxTier = this.calculateAllowedTier(time);

    if (this.state.currentPhase === 'calm' && this.state.calmDuration > MAX_CALM_DURATION) {
      this.state.currentPhase = 'building';
      this.state.phaseStartTime = time;
    }

    if (this.state.currentPhase === 'climax' && this.state.timeInPhase > 120) {
      this.state.currentPhase = 'aftermath';
      this.state.phaseStartTime = time;
    }

    if (this.state.currentPhase === 'aftermath' && this.state.timeInPhase > 90) {
      this.state.currentPhase = 'calm';
      this.state.phaseStartTime = time;
    }

    if (this.state.currentPhase === 'cooldown' && this.state.timeInPhase > 60) {
      this.state.currentPhase = 'calm';
      this.state.phaseStartTime = time;
      this.state.consecutiveMinorEvents = 0;
    }

    let targetTier: StoryTier = preferredTier ?? 'common';
    if (TIER_ORDER.indexOf(targetTier) > TIER_ORDER.indexOf(maxTier)) {
      targetTier = maxTier;
    }

    const tensionTarget = this.calculateTension(time);

    return {
      allowEvent: true,
      targetTier,
      phase: this.state.currentPhase,
      tensionTarget,
      reason: `Phase: ${this.state.currentPhase}, allowed up to ${maxTier}`,
      waitTime: 0,
    };
  }

  private updatePhase(time: number): void {
    if (this.state.currentPhase !== 'calm') return;
    this.state.tensionLevel = Math.min(1, this.state.tensionLevel + 0.002);
  }

  private calculateAllowedTier(time: number): StoryTier {
    const timeSinceLastMajor = time - this.state.lastClimaxTime;

    if (timeSinceLastMajor < 120) return 'uncommon';
    if (timeSinceLastMajor < 300) return 'rare';
    if (this.state.consecutiveMinorEvents < 3) return 'uncommon';
    return 'legendary';
  }

  private calculateTension(time: number): number {
    if (this.state.currentPhase === 'climax') return 1;
    if (this.state.currentPhase === 'aftermath') return 0.3;

    const buildup = this.state.calmDuration / TENSION_BUILDUP_MAX;
    return Math.min(0.8, buildup * 0.7);
  }

  getState(): PacingState {
    return { ...this.state };
  }

  getPhase(): PacingState['currentPhase'] {
    return this.state.currentPhase;
  }

  getTensionLevel(): number {
    return this.state.tensionLevel;
  }

  reset(): void {
    this.state = {
      lastEventTime: -999,
      lastEventTier: 'common',
      cooldownRemaining: 0,
      currentPhase: 'calm',
      phaseStartTime: 0,
      timeInPhase: 0,
      eventsSinceLastMajor: 0,
      tensionLevel: 0,
      calmDuration: 0,
      lastClimaxTime: -999,
      consecutiveMinorEvents: 0,
      totalEvents: 0,
    };
  }
}
