import type { CitizenProfile } from './citizen';

export type VoteStatus = 'active' | 'locked' | 'expired';

export interface VoteOption {
  id: string;
  label: string;
  icon: string;
  votes: number;
  voters: Map<string, number>;
  probabilityModifier: number;
}

export interface Vote {
  id: string;
  title: string;
  subtitle: string;
  options: VoteOption[];
  status: VoteStatus;
  createdAt: number;
  lockAt: number;
  expireAt: number;
  totalVotes: number;
  influenceBudget: number;
  context: {
    actorA: string;
    actorB: string;
    tension: number;
    situationType: string;
  };
}

export interface VoteResult {
  winningOption: VoteOption;
  totalInfluence: number;
  modifierBreakdown: Array<{
    optionId: string;
    label: string;
    rawVotes: number;
    weightedVotes: number;
    modifier: number;
  }>;
}

export interface RateLimitEntry {
  lastAction: number;
  actionCount: number;
  windowStart: number;
}

export interface AntiAbuseConfig {
  maxVotesPerMinute: number;
  maxVotesPerHour: number;
  cooldownMs: number;
  duplicateWindowMs: number;
  suspiciousThreshold: number;
}

export const DEFAULT_ANTI_ABUSE: AntiAbuseConfig = {
  maxVotesPerMinute: 5,
  maxVotesPerHour: 30,
  cooldownMs: 3000,
  duplicateWindowMs: 60000,
  suspiciousThreshold: 100,
};

export class VotingSystem {
  private votes: Map<string, Vote> = new Map();
  private rateLimits: Map<string, RateLimitEntry> = new Map();
  private recentVotes: Map<string, number[]> = new Map();
  private suspiciousCitizens: Set<string> = new Set();
  private config: AntiAbuseConfig;
  private nextId = 1;

  constructor(config: AntiAbuseConfig = DEFAULT_ANTI_ABUSE) {
    this.config = config;
  }

  createVote(
    title: string,
    subtitle: string,
    options: Array<{ label: string; icon: string }>,
    context: Vote['context'],
    lockDelayMs: number = 30000,
    expireMs: number = 120000,
  ): Vote {
    const id = `vote-${this.nextId++}`;
    const now = Date.now();

    const voteOptions: VoteOption[] = options.map((opt, i) => ({
      id: `opt-${id}-${i}`,
      label: opt.label,
      icon: opt.icon,
      votes: 0,
      voters: new Map(),
      probabilityModifier: 0,
    }));

    const vote: Vote = {
      id,
      title,
      subtitle,
      options: voteOptions,
      status: 'active',
      createdAt: now,
      lockAt: now + lockDelayMs,
      expireAt: now + lockDelayMs + expireMs,
      totalVotes: 0,
      influenceBudget: 0,
      context,
    };

    this.votes.set(id, vote);
    return vote;
  }

  castVote(
    voteId: string,
    citizenId: string,
    optionId: string,
    influenceCost: number = 15,
  ): { success: boolean; error?: string; modifier?: number } {
    const vote = this.votes.get(voteId);
    if (!vote) return { success: false, error: 'Vote not found' };
    if (vote.status !== 'active') return { success: false, error: 'Vote is ' + vote.status };

    const now = Date.now();
    if (now >= vote.lockAt) {
      vote.status = 'locked';
      return { success: false, error: 'Vote just locked' };
    }

    if (!this.checkRateLimit(citizenId)) {
      return { success: false, error: 'Rate limited — slow down' };
    }

    if (this.suspiciousCitizens.has(citizenId)) {
      return { success: false, error: 'Account under review' };
    }

    const recentVoterVotes = this.recentVotes.get(citizenId) ?? [];
    const duplicateCheck = recentVoterVotes.some(
      (v) => now - v < this.config.duplicateWindowMs && this.getVoteOption(voteId, citizenId) === optionId
    );
    if (duplicateCheck) {
      return { success: false, error: 'Duplicate vote rejected' };
    }

    const existingOption = this.findVotedOption(vote, citizenId);
    if (existingOption) {
      existingOption.votes = Math.max(0, existingOption.votes - 1);
      existingOption.voters.delete(citizenId);
      vote.totalVotes = Math.max(0, vote.totalVotes);
    }

    const option = vote.options.find((o) => o.id === optionId);
    if (!option) return { success: false, error: 'Option not found' };

    option.votes++;
    option.voters.set(citizenId, influenceCost);
    vote.totalVotes++;
    vote.influenceBudget += influenceCost;

    recentVoterVotes.push(now);
    if (recentVoterVotes.length > 50) recentVoterVotes.shift();
    this.recentVotes.set(citizenId, recentVoterVotes);

    this.recordRateLimit(citizenId);
    this.checkSuspiciousActivity(citizenId);

    return { success: true, modifier: option.probabilityModifier };
  }

  private checkRateLimit(citizenId: string): boolean {
    const now = Date.now();
    const entry = this.rateLimits.get(citizenId);
    if (!entry) return true;

    if (now - entry.windowStart > 60000) {
      entry.actionCount = 0;
      entry.windowStart = now;
    }

    if (entry.actionCount >= this.config.maxVotesPerMinute) return false;
    if (now - entry.lastAction < this.config.cooldownMs) return false;

    return true;
  }

  private recordRateLimit(citizenId: string): void {
    const now = Date.now();
    const entry = this.rateLimits.get(citizenId);
    if (!entry || now - entry.windowStart > 60000) {
      this.rateLimits.set(citizenId, { lastAction: now, actionCount: 1, windowStart: now });
    } else {
      entry.lastAction = now;
      entry.actionCount++;
    }
  }

  private checkSuspiciousActivity(citizenId: string): void {
    const votes = this.recentVotes.get(citizenId) ?? [];
    const recentWindow = 300000;
    const recentCount = votes.filter((v) => Date.now() - v < recentWindow).length;
    if (recentCount > this.config.suspiciousThreshold) {
      this.suspiciousCitizens.add(citizenId);
    }
  }

  private findVotedOption(vote: Vote, citizenId: string): VoteOption | undefined {
    return vote.options.find((o) => o.voters.has(citizenId));
  }

  private getVoteOption(voteId: string, citizenId: string): string | undefined {
    const vote = this.votes.get(voteId);
    if (!vote) return undefined;
    const opt = vote.options.find((o) => o.voters.has(citizenId));
    return opt?.id;
  }

  computeModifiers(vote: Vote): VoteResult | null {
    if (vote.totalVotes === 0) return null;

    const modifierBreakdown: VoteResult['modifierBreakdown'] = [];
    let maxInfluence = 0;

    for (const option of vote.options) {
      let weightedVotes = 0;
      for (const [citizenId, influence] of option.voters) {
        if (!this.suspiciousCitizens.has(citizenId)) {
          weightedVotes += influence;
        }
      }
      const modifier = vote.influenceBudget > 0
        ? (weightedVotes / vote.influenceBudget) * 15
        : 0;
      maxInfluence = Math.max(maxInfluence, modifier);

      modifierBreakdown.push({
        optionId: option.id,
        label: option.label,
        rawVotes: option.votes,
        weightedVotes,
        modifier,
      });
    }

    const winningOption = vote.options.reduce((a, b) => a.votes > b.votes ? a : b);

    return {
      winningOption,
      totalInfluence: vote.influenceBudget,
      modifierBreakdown,
    };
  }

  lockVote(voteId: string): boolean {
    const vote = this.votes.get(voteId);
    if (!vote || vote.status !== 'active') return false;
    vote.status = 'locked';
    return true;
  }

  getActiveVotes(): Vote[] {
    const now = Date.now();
    return Array.from(this.votes.values()).filter((v) => {
      if (v.status === 'active' && now >= v.lockAt) {
        v.status = 'locked';
      }
      return v.status === 'active';
    });
  }

  getVote(voteId: string): Vote | undefined {
    return this.votes.get(voteId);
  }

  isSuspicious(citizenId: string): boolean {
    return this.suspiciousCitizens.has(citizenId);
  }

  cleanup(maxAge: number = 3600000): number {
    const cutoff = Date.now() - maxAge;
    let removed = 0;
    for (const [id, vote] of this.votes) {
      if ((vote.status === 'locked' || vote.status === 'expired') && vote.expireAt < cutoff) {
        this.votes.delete(id);
        removed++;
      }
    }
    return removed;
  }
}
