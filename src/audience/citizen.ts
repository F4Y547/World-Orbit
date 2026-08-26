export interface CitizenProfile {
  id: string;
  displayName: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  totalXp: number;
  createdAt: number;
  lastActiveAt: number;
  totalSessionMs: number;
  currentSessionStart: number;
  predictionsMade: number;
  predictionsCorrect: number;
  predictionAccuracy: number;
  eventsWitnessed: number;
  majorEventsWitnessed: number;
  currentStreak: number;
  bestStreak: number;
  achievements: string[];
  badges: string[];
  reputation: ReputationScore;
  influence: InfluenceBudget;
  recentPredictions: PredictionResult[];
  recentEvents: WitnessedEvent[];
}

export interface ReputationScore {
  overall: number;
  predictionSkill: number;
  attendance: number;
  consistency: number;
  community: number;
  decay: number;
}

export interface InfluenceBudget {
  dailyMax: number;
  used: number;
  remaining: number;
  lastResetDay: number;
}

export interface PredictionResult {
  predictionId: string;
  optionId: string;
  correct: boolean;
  xpAwarded: number;
  timestamp: number;
}

export interface WitnessedEvent {
  eventId: string;
  kind: string;
  headline: string;
  day: number;
  timestamp: number;
  wasMajor: boolean;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'legendary';
  condition: (profile: CitizenProfile) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-prediction', name: 'First Call', description: 'Made your first prediction', icon: '🎯', tier: 'bronze', condition: (p) => p.predictionsMade >= 1 },
  { id: 'ten-predictions', name: 'Regular Predictor', description: 'Made 10 predictions', icon: '📊', tier: 'bronze', condition: (p) => p.predictionsMade >= 10 },
  { id: 'fifty-predictions', name: 'Crystal Ball', description: 'Made 50 predictions', icon: '🔮', tier: 'silver', condition: (p) => p.predictionsMade >= 50 },
  { id: 'hundred-predictions', name: 'Oracle', description: 'Made 100 predictions', icon: '👁', tier: 'gold', condition: (p) => p.predictionsMade >= 100 },
  { id: 'first-war', name: 'First War', description: 'Witnessed your first war', icon: '⚔️', tier: 'bronze', condition: (p) => p.majorEventsWitnessed >= 1 },
  { id: 'war-predictor', name: 'War Predictor', description: 'Correctly predicted 5 wars', icon: '⚔️', tier: 'silver', condition: (p) => p.predictionsCorrect >= 5 },
  { id: 'historian', name: 'Historian', description: 'Witnessed 100 major events', icon: '🌍', tier: 'gold', condition: (p) => p.majorEventsWitnessed >= 100 },
  { id: 'superpower-witness', name: 'Superpower Witness', description: 'Witnessed a superpower rise', icon: '👑', tier: 'silver', condition: (p) => p.eventsWitnessed >= 50 },
  { id: 'collapse-witness', name: 'Collapse Witness', description: 'Witnessed a superpower collapse', icon: '💥', tier: 'gold', condition: (p) => p.majorEventsWitnessed >= 20 },
  { id: 'legendary-witness', name: 'Unknown', description: 'Witnessed a legendary mystery', icon: '🌌', tier: 'legendary', condition: (p) => p.majorEventsWitnessed >= 50 },
  { id: 'survivor', name: 'Survivor', description: 'Stayed through a major crisis', icon: '🏆', tier: 'silver', condition: (p) => p.totalSessionMs >= 3600000 },
  { id: 'early-citizen', name: 'Early Citizen', description: 'Watched for 1 hour', icon: '🕐', tier: 'bronze', condition: (p) => p.totalSessionMs >= 3600000 },
  { id: 'dedicated-citizen', name: 'Dedicated Citizen', description: 'Watched for 10 hours', icon: '🌟', tier: 'silver', condition: (p) => p.totalSessionMs >= 36000000 },
  { id: 'hundred-hour', name: '100-Hour Citizen', description: 'Watched for 100 hours', icon: '🏅', tier: 'legendary', condition: (p) => p.totalSessionMs >= 360000000 },
  { id: 'streak-5', name: 'Hot Streak', description: '5 correct predictions in a row', icon: '🔥', tier: 'bronze', condition: (p) => p.bestStreak >= 5 },
  { id: 'streak-10', name: 'On Fire', description: '10 correct predictions in a row', icon: '🔥', tier: 'silver', condition: (p) => p.bestStreak >= 10 },
  { id: 'streak-25', name: 'Unstoppable', description: '25 correct predictions in a row', icon: '🔥', tier: 'gold', condition: (p) => p.bestStreak >= 25 },
  { id: 'level-10', name: 'Veteran', description: 'Reached level 10', icon: '⭐', tier: 'silver', condition: (p) => p.level >= 10 },
  { id: 'level-25', name: 'Elite', description: 'Reached level 25', icon: '⭐', tier: 'gold', condition: (p) => p.level >= 25 },
  { id: 'level-50', name: 'Legendary', description: 'Reached level 50', icon: '⭐', tier: 'legendary', condition: (p) => p.level >= 50 },
];

export const XP_TABLE: Array<{ level: number; xpRequired: number }> = [];
(function buildXpTable(): void {
  let total = 0;
  for (let lvl = 1; lvl <= 100; lvl++) {
    const xpForLevel = Math.floor(100 * Math.pow(1.15, lvl - 1));
    total += xpForLevel;
    XP_TABLE.push({ level: lvl, xpRequired: total });
  }
})();

export const XP_REWARDS = {
  predictionCorrect: 50,
  predictionIncorrect: 10,
  predictionStreakBonus: 5,
  majorEventWitnessed: 25,
  minorEventWitnessed: 5,
  hourlyWatch: 100,
  achievementUnlocked: 200,
  dailyLogin: 25,
  perfectDay: 150,
};

export const REPUTATION_WEIGHTS = {
  predictionAccuracy: 0.35,
  eventsWitnessed: 0.15,
  attendance: 0.25,
  consistency: 0.15,
  community: 0.10,
};

export const INFLUENCE_CONFIG = {
  dailyMax: 100,
  predictionCost: 10,
  voteCost: 15,
  commandCost: 5,
  resetHourUTC: 0,
};

let nextCitizenId = 1;

export function createCitizenProfile(displayName?: string): CitizenProfile {
  const id = `citizen-${nextCitizenId++}`;
  const now = Date.now();
  return {
    id,
    displayName: displayName ?? `Citizen_${String(nextCitizenId - 1).padStart(5, '0')}`,
    level: 1,
    xp: 0,
    xpToNextLevel: XP_TABLE[0].xpRequired,
    totalXp: 0,
    createdAt: now,
    lastActiveAt: now,
    totalSessionMs: 0,
    currentSessionStart: now,
    predictionsMade: 0,
    predictionsCorrect: 0,
    predictionAccuracy: 0,
    eventsWitnessed: 0,
    majorEventsWitnessed: 0,
    currentStreak: 0,
    bestStreak: 0,
    achievements: [],
    badges: [],
    reputation: {
      overall: 50,
      predictionSkill: 50,
      attendance: 50,
      consistency: 50,
      community: 50,
      decay: 0,
    },
    influence: {
      dailyMax: INFLUENCE_CONFIG.dailyMax,
      used: 0,
      remaining: INFLUENCE_CONFIG.dailyMax,
      lastResetDay: Math.floor(now / 86400000),
    },
    recentPredictions: [],
    recentEvents: [],
  };
}

export function addXp(profile: CitizenProfile, amount: number, reason: string): number {
  let totalAwarded = amount;
  profile.xp += amount;
  profile.totalXp += amount;

  while (profile.xp >= profile.xpToNextLevel && profile.level < 100) {
    profile.xp -= profile.xpToNextLevel;
    profile.level++;
    profile.xpToNextLevel = XP_TABLE[Math.min(profile.level - 1, XP_TABLE.length - 1)].xpRequired;
    totalAwarded += XP_REWARDS.achievementUnlocked;
  }

  void reason;
  return totalAwarded;
}

export function updateReputation(profile: CitizenProfile): void {
  const r = profile.reputation;
  r.predictionSkill = profile.predictionsMade > 0
    ? Math.round(profile.predictionAccuracy * 100)
    : 50;
  r.attendance = Math.min(100, Math.round((profile.totalSessionMs / 3600000) * 10));
  const daysSinceCreation = Math.max(1, (Date.now() - profile.createdAt) / 86400000);
  const activeDays = Math.min(daysSinceCreation, profile.eventsWitnessed);
  r.consistency = Math.min(100, Math.round((activeDays / daysSinceCreation) * 100));
  const eventScore = Math.min(100, profile.eventsWitnessed);
  r.overall = Math.round(
    r.predictionSkill * REPUTATION_WEIGHTS.predictionAccuracy +
    r.attendance * REPUTATION_WEIGHTS.attendance +
    r.consistency * REPUTATION_WEIGHTS.consistency +
    eventScore * REPUTATION_WEIGHTS.eventsWitnessed +
    r.community * REPUTATION_WEIGHTS.community
  );
}

export function checkAchievements(profile: CitizenProfile): string[] {
  const newAchievements: string[] = [];
  for (const ach of ACHIEVEMENTS) {
    if (!profile.achievements.includes(ach.id) && ach.condition(profile)) {
      profile.achievements.push(ach.id);
      profile.badges.push(ach.icon);
      newAchievements.push(ach.id);
    }
  }
  return newAchievements;
}

export function useInfluence(profile: CitizenProfile, amount: number): boolean {
  const now = Date.now();
  const currentDay = Math.floor(now / 86400000);
  if (currentDay > profile.influence.lastResetDay) {
    profile.influence.used = 0;
    profile.influence.remaining = profile.influence.dailyMax;
    profile.influence.lastResetDay = currentDay;
  }
  if (profile.influence.remaining < amount) return false;
  profile.influence.used += amount;
  profile.influence.remaining -= amount;
  return true;
}

export function recordSessionTime(profile: CitizenProfile): void {
  const now = Date.now();
  profile.totalSessionMs += now - profile.currentSessionStart;
  profile.currentSessionStart = now;
  profile.lastActiveAt = now;
}

export function recordEventWitness(profile: CitizenProfile, eventId: string, kind: string, headline: string, day: number, isMajor: boolean): void {
  profile.eventsWitnessed++;
  if (isMajor) profile.majorEventsWitnessed++;
  profile.recentEvents.unshift({
    eventId, kind, headline, day, timestamp: Date.now(), wasMajor: isMajor,
  });
  if (profile.recentEvents.length > 50) profile.recentEvents.pop();
}

export function getLevelTitle(level: number): string {
  if (level >= 50) return 'Legendary';
  if (level >= 25) return 'Elite';
  if (level >= 18) return 'Veteran';
  if (level >= 10) return 'Experienced';
  if (level >= 5) return 'Citizen';
  if (level >= 2) return 'Newcomer';
  return 'Observer';
}
