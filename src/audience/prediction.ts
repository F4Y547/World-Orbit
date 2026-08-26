import type { CitizenProfile } from './citizen';

export type PredictionStatus = 'open' | 'locked' | 'resolved' | 'expired';

export interface PredictionOption {
  id: string;
  label: string;
  icon: string;
  votes: number;
  voters: string[];
}

export interface Prediction {
  id: string;
  triggerEventId: number;
  title: string;
  subtitle: string;
  options: PredictionOption[];
  status: PredictionStatus;
  createdAt: number;
  lockAt: number;
  resolveAt: number | null;
  correctOptionId: string | null;
  totalVotes: number;
  context: {
    kind: string;
    actorA: string;
    actorB: string;
    tension: number;
    tier: string;
  };
}

export interface PredictionReward {
  citizenId: string;
  predictionId: string;
  correct: boolean;
  xpAwarded: number;
  streakBonus: number;
  newStreak: number;
}

export interface PredictionStats {
  totalPredictions: number;
  totalVotes: number;
  activePredictions: number;
  resolvedToday: number;
  averageVotesPerPrediction: number;
  mostPredictedOption: string;
  accuracyOverall: number;
}

export interface PredictionStore {
  predictions: Map<string, Prediction>;
  citizenPredictions: Map<string, string[]>;
  nextId: number;
}

export function createStore(): PredictionStore {
  return {
    predictions: new Map(),
    citizenPredictions: new Map(),
    nextId: 1,
  };
}

export function createPrediction(
  store: PredictionStore,
  title: string,
  subtitle: string,
  options: Array<{ label: string; icon: string }>,
  context: Prediction['context'],
  triggerEventId: number,
  lockDelayMs: number = 30000,
): Prediction {
  const id = `pred-${store.nextId++}`;
  const now = Date.now();

  const predictionOptions: PredictionOption[] = options.map((opt, i) => ({
    id: `opt-${id}-${i}`,
    label: opt.label,
    icon: opt.icon,
    votes: 0,
    voters: [],
  }));

  const prediction: Prediction = {
    id,
    triggerEventId,
    title,
    subtitle,
    options: predictionOptions,
    status: 'open',
    createdAt: now,
    lockAt: now + lockDelayMs,
    resolveAt: null,
    correctOptionId: null,
    totalVotes: 0,
    context,
  };

  store.predictions.set(id, prediction);
  return prediction;
}

export function castVote(
  store: PredictionStore,
  predictionId: string,
  citizenId: string,
  optionId: string,
): { success: boolean; error?: string; voteCount?: number } {
  const prediction = store.predictions.get(predictionId);
  if (!prediction) return { success: false, error: 'Prediction not found' };
  if (prediction.status !== 'open') return { success: false, error: 'Prediction is ' + prediction.status };

  const now = Date.now();
  if (now >= prediction.lockAt) {
    prediction.status = 'locked';
    return { success: false, error: 'Prediction just locked' };
  }

  const option = prediction.options.find((o) => o.id === optionId);
  if (!option) return { success: false, error: 'Option not found' };

  const existing = prediction.options.find((o) => o.voters.includes(citizenId));
  if (existing) {
    existing.votes = Math.max(0, existing.votes - 1);
    existing.voters = existing.voters.filter((v) => v !== citizenId);
    prediction.totalVotes = Math.max(0, prediction.totalVotes);
  }

  option.votes++;
  option.voters.push(citizenId);
  prediction.totalVotes++;

  const citizenPreds = store.citizenPredictions.get(citizenId) ?? [];
  if (!citizenPreds.includes(predictionId)) {
    citizenPreds.push(predictionId);
    store.citizenPredictions.set(citizenId, citizenPreds);
  }

  return { success: true, voteCount: option.votes };
}

export function lockPrediction(store: PredictionStore, predictionId: string): boolean {
  const prediction = store.predictions.get(predictionId);
  if (!prediction || prediction.status !== 'open') return false;
  prediction.status = 'locked';
  return true;
}

export function resolvePrediction(
  store: PredictionStore,
  predictionId: string,
  correctOptionId: string,
): PredictionReward[] {
  const prediction = store.predictions.get(predictionId);
  if (!prediction) return [];
  if (prediction.status !== 'locked' && prediction.status !== 'open') return [];

  prediction.status = 'resolved';
  prediction.correctOptionId = correctOptionId;
  prediction.resolveAt = Date.now();

  const rewards: PredictionReward[] = [];

  for (const option of prediction.options) {
    const isCorrect = option.id === correctOptionId;
    for (const voterId of option.voters) {
      const xp = isCorrect ? 50 : 10;
      rewards.push({
        citizenId: voterId,
        predictionId,
        correct: isCorrect,
        xpAwarded: xp,
        streakBonus: isCorrect ? 5 : 0,
        newStreak: isCorrect ? 1 : 0,
      });
    }
  }

  return rewards;
}

export function expirePrediction(store: PredictionStore, predictionId: string): boolean {
  const prediction = store.predictions.get(predictionId);
  if (!prediction) return false;
  if (prediction.status === 'resolved') return false;
  prediction.status = 'expired';
  prediction.resolveAt = Date.now();
  return true;
}

export function getActivePredictions(store: PredictionStore): Prediction[] {
  return Array.from(store.predictions.values())
    .filter((p) => p.status === 'open' || p.status === 'locked')
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getPredictionStats(store: PredictionStore): PredictionStats {
  const all = Array.from(store.predictions.values());
  const resolved = all.filter((p) => p.status === 'resolved');
  const active = all.filter((p) => p.status === 'open' || p.status === 'locked');
  const today = Date.now() - 86400000;
  const resolvedToday = resolved.filter((p) => (p.resolveAt ?? 0) > today).length;

  let totalVotes = 0;
  let mostVotes = 0;
  let mostOption = '';
  for (const p of all) {
    totalVotes += p.totalVotes;
    for (const opt of p.options) {
      if (opt.votes > mostVotes) {
        mostVotes = opt.votes;
        mostOption = opt.label;
      }
    }
  }

  let correctVotes = 0;
  let totalResolvedVotes = 0;
  for (const p of resolved) {
    const correct = p.options.find((o) => o.id === p.correctOptionId);
    if (correct) {
      correctVotes += correct.votes;
      totalResolvedVotes += p.totalVotes;
    }
  }

  return {
    totalPredictions: all.length,
    totalVotes,
    activePredictions: active.length,
    resolvedToday,
    averageVotesPerPrediction: all.length > 0 ? totalVotes / all.length : 0,
    mostPredictedOption: mostOption,
    accuracyOverall: totalResolvedVotes > 0 ? correctVotes / totalResolvedVotes : 0,
  };
}

export function cleanupOldPredictions(store: PredictionStore, maxAge: number = 86400000): number {
  const cutoff = Date.now() - maxAge;
  let removed = 0;
  for (const [id, pred] of store.predictions) {
    if (pred.status === 'resolved' && (pred.resolveAt ?? 0) < cutoff) {
      store.predictions.delete(id);
      removed++;
    }
  }
  return removed;
}
