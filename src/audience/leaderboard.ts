import type { CitizenProfile, Achievement } from './citizen';
import { ACHIEVEMENTS } from './citizen';

export interface LeaderboardEntry {
  rank: number;
  citizenId: string;
  displayName: string;
  level: number;
  xp: number;
  accuracy: number;
  predictions: number;
  eventsWitnessed: number;
  badges: string[];
  title: string;
}

export interface LeaderboardSnapshot {
  timestamp: number;
  entries: LeaderboardEntry[];
  totalCitizens: number;
  seasonNumber: number;
  seasonStart: number;
  seasonEnd: number;
}

export interface SeasonConfig {
  number: number;
  startTime: number;
  endTime: number;
  rotationIntervalMs: number;
}

const SEASON_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

export class Leaderboard {
  private citizens: Map<string, CitizenProfile> = new Map();
  private currentSeason: SeasonConfig;
  private lastRotation = 0;
  private cachedSnapshot: LeaderboardSnapshot | null = null;

  constructor() {
    const now = Date.now();
    this.currentSeason = {
      number: 1,
      startTime: now,
      endTime: now + SEASON_DURATION_MS,
      rotationIntervalMs: ROTATION_INTERVAL_MS,
    };
  }

  registerCitizen(profile: CitizenProfile): void {
    this.citizens.set(profile.id, profile);
    this.cachedSnapshot = null;
  }

  updateCitizen(profile: CitizenProfile): void {
    this.citizens.set(profile.id, profile);
    this.cachedSnapshot = null;
  }

  getCitizen(citizenId: string): CitizenProfile | undefined {
    return this.citizens.get(citizenId);
  }

  getAllCitizens(): CitizenProfile[] {
    return Array.from(this.citizens.values());
  }

  getSnapshot(forceRefresh = false): LeaderboardSnapshot {
    if (this.cachedSnapshot && !forceRefresh) return this.cachedSnapshot;

    const now = Date.now();
    this.checkSeasonRotation(now);

    const sorted = Array.from(this.citizens.values())
      .sort((a, b) => {
        if (b.totalXp !== a.totalXp) return b.totalXp - a.totalXp;
        if (b.predictionsCorrect !== a.predictionsCorrect) return b.predictionsCorrect - a.predictionsCorrect;
        return b.eventsWitnessed - a.eventsWitnessed;
      });

    const entries: LeaderboardEntry[] = sorted.map((profile, i) => ({
      rank: i + 1,
      citizenId: profile.id,
      displayName: profile.displayName,
      level: profile.level,
      xp: profile.totalXp,
      accuracy: profile.predictionsMade > 0 ? profile.predictionsCorrect / profile.predictionsMade : 0,
      predictions: profile.predictionsMade,
      eventsWitnessed: profile.eventsWitnessed,
      badges: profile.badges.slice(0, 5),
      title: getTitleForLevel(profile.level),
    }));

    this.cachedSnapshot = {
      timestamp: now,
      entries,
      totalCitizens: this.citizens.size,
      seasonNumber: this.currentSeason.number,
      seasonStart: this.currentSeason.startTime,
      seasonEnd: this.currentSeason.endTime,
    };

    return this.cachedSnapshot;
  }

  getTop(n: number): LeaderboardEntry[] {
    return this.getSnapshot().entries.slice(0, n);
  }

  getCitizenRank(citizenId: string): number | null {
    const entries = this.getSnapshot().entries;
    const idx = entries.findIndex((e) => e.citizenId === citizenId);
    return idx >= 0 ? idx + 1 : null;
  }

  rotateLeaderboard(): LeaderboardSnapshot {
    const old = this.getSnapshot();
    const shuffled = [...old.entries].sort(() => Math.random() - 0.5);
    const rotated = shuffled.map((entry, i) => ({ ...entry, rank: i + 1 }));

    this.lastRotation = Date.now();
    this.cachedSnapshot = {
      ...old,
      timestamp: Date.now(),
      entries: rotated,
    };

    return this.cachedSnapshot;
  }

  private checkSeasonRotation(now: number): void {
    if (now >= this.currentSeason.endTime) {
      this.currentSeason = {
        number: this.currentSeason.number + 1,
        startTime: now,
        endTime: now + SEASON_DURATION_MS,
        rotationIntervalMs: ROTATION_INTERVAL_MS,
      };
      this.lastRotation = now;
    }

    if (now - this.lastRotation >= this.currentSeason.rotationIntervalMs) {
      this.rotateLeaderboard();
    }
  }

  getSeasonTimeRemaining(): number {
    return Math.max(0, this.currentSeason.endTime - Date.now());
  }

  getAchievementDefinitions(): Achievement[] {
    return ACHIEVEMENTS;
  }

  getCitizensWithAchievement(achievementId: string): CitizenProfile[] {
    return Array.from(this.citizens.values())
      .filter((c) => c.achievements.includes(achievementId));
  }

  getGlobalStats(): {
    totalCitizens: number;
    totalPredictions: number;
    averageAccuracy: number;
    totalEventsWitnessed: number;
    activeToday: number;
  } {
    const all = Array.from(this.citizens.values());
    const today = Date.now() - 86400000;
    let totalPredictions = 0;
    let correctPredictions = 0;
    let totalEvents = 0;
    let activeToday = 0;

    for (const c of all) {
      totalPredictions += c.predictionsMade;
      correctPredictions += c.predictionsCorrect;
      totalEvents += c.eventsWitnessed;
      if (c.lastActiveAt > today) activeToday++;
    }

    return {
      totalCitizens: all.length,
      totalPredictions,
      averageAccuracy: totalPredictions > 0 ? correctPredictions / totalPredictions : 0,
      totalEventsWitnessed: totalEvents,
      activeToday,
    };
  }
}

function getTitleForLevel(level: number): string {
  if (level >= 50) return 'Legendary';
  if (level >= 25) return 'Elite';
  if (level >= 18) return 'Veteran';
  if (level >= 10) return 'Experienced';
  if (level >= 5) return 'Citizen';
  if (level >= 2) return 'Newcomer';
  return 'Observer';
}
