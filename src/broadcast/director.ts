import type { WorldState, SimEvent } from '../sim/types';

export interface ProgrammingDecision {
  focusStoryId: string | null;
  focusCountries: string[];
  mode: 'live' | 'active-story' | 'calm' | 'anticipation' | 'major-event';
  reason: string;
  duration: number;
  transitionHint: string | null;
}

interface TrackedStory {
  id: string;
  score: number;
  kind: string;
  countries: string[];
  startTime: number;
  focusCount: number;
  lastFocusTime: number;
}

export class ProgrammingDirector {
  private trackedStories: Map<string, TrackedStory> = new Map();
  private currentFocus: string | null = null;
  private focusSince = 0;
  private minFocusDuration = 8;
  private maxFocusDuration = 120;
  private lastDecisionTime = 0;
  private focusHistory: string[] = [];
  private maxFocusHistory = 50;

  decide(w: WorldState): ProgrammingDecision {
    const now = w.time;

    const activeStories = this.getActiveStories(w);
    this.updateScores(w, activeStories);

    const sorted = [...activeStories].sort((a, b) => b.score - a.score);
    const topStory = sorted[0];
    const secondStory = sorted[1] ?? null;

    const focusElapsed = now - this.focusSince;

    if (this.currentFocus && focusElapsed < this.minFocusDuration) {
      return this.holdFocus(this.makeCurrentStory(this.currentFocus));
    }

    if (topStory && topStory.score >= 90) {
      return this.switchTo(topStory, now, 'major-event', 'Legendary event in progress');
    }

    if (topStory && topStory.score >= 75) {
      if (this.currentFocus === topStory.id && focusElapsed < this.maxFocusDuration) {
        return this.holdFocus(this.makeCurrentStory(this.currentFocus));
      }
      return this.switchTo(topStory, now, 'active-story', 'High-scoring story developing');
    }

    if (topStory && topStory.score >= 55) {
      if (focusElapsed < 60) {
        return this.holdFocus(this.makeCurrentStory(this.currentFocus));
      }
      if (secondStory && secondStory.score > topStory.score - 10) {
        return this.switchTo(secondStory, now, 'anticipation', 'Switching to fresher story');
      }
      return this.switchTo(topStory, now, 'active-story', 'Moderate story ongoing');
    }

    if (topStory && topStory.score >= 35) {
      return this.switchTo(topStory, now, 'calm', 'Low-key events, building tension');
    }

    return {
      focusStoryId: null,
      focusCountries: [],
      mode: 'calm',
      reason: 'No significant events — calm period',
      duration: 30,
      transitionHint: 'Wait for next event',
    };
  }

  private getActiveStories(w: WorldState): TrackedStory[] {
    const stories: TrackedStory[] = [];
    for (const event of w.news) {
      if (!event.headline) continue;
      const key = event.headline;
      if (!this.trackedStories.has(key)) {
        this.trackedStories.set(key, {
          id: key,
          score: 0,
          kind: event.kind,
          countries: [event.actorA, event.actorB].filter(Boolean),
          startTime: w.time,
          focusCount: 0,
          lastFocusTime: 0,
        });
      }
      stories.push(this.trackedStories.get(key)!);
    }
    for (const [, war] of w.wars) {
      if (war.outcome === null) {
        const warKey = `war-${war.attackerId}-${war.defenderId}`;
        if (!this.trackedStories.has(warKey)) {
          this.trackedStories.set(warKey, {
            id: warKey,
            score: 60,
            kind: 'war',
            countries: [war.attackerId, war.defenderId],
            startTime: w.time,
            focusCount: 0,
            lastFocusTime: 0,
          });
          stories.push(this.trackedStories.get(warKey)!);
        }
      }
    }
    this.pruneOldStories(w.time);
    return stories;
  }

  private updateScores(w: WorldState, stories: TrackedStory[]): void {
    for (const story of stories) {
      let score = 0;
      if (story.kind === 'war' || story.kind === 'battle') score += 50;
      else if (story.kind === 'alliance' || story.kind === 'rivalry') score += 30;
      else if (story.kind === 'rebellion' || story.kind === 'coup') score += 60;
      else score += 20;

      if (story.countries.some((c) => w.byId.has(c))) {
        score += 15;
      }

      const age = w.time - story.startTime;
      if (age < 30) score += 10;
      else if (age > 300) score -= 15;

      if (story.id === this.currentFocus) {
        score += 5;
      }

      story.score = Math.max(0, Math.min(100, score));
    }
  }

  private switchTo(
    story: TrackedStory,
    now: number,
    mode: ProgrammingDecision['mode'],
    reason: string,
  ): ProgrammingDecision {
    if (story.id !== this.currentFocus) {
      story.focusCount++;
      story.lastFocusTime = now;
      this.currentFocus = story.id;
      this.focusSince = now;
      this.focusHistory.push(story.id);
      if (this.focusHistory.length > this.maxFocusHistory) this.focusHistory.shift();
    }
    return {
      focusStoryId: story.id,
      focusCountries: story.countries,
      mode,
      reason,
      duration: mode === 'major-event' ? 60 : 30,
      transitionHint: null,
    };
  }

  private holdFocus(decision: ProgrammingDecision): ProgrammingDecision {
    return decision;
  }

  private makeCurrentStory(id: string | null): ProgrammingDecision {
    const story = id ? this.trackedStories.get(id) : null;
    return {
      focusStoryId: id,
      focusCountries: story?.countries ?? [],
      mode: 'active-story',
      reason: 'Continuing current focus',
      duration: 20,
      transitionHint: null,
    };
  }

  private pruneOldStories(now: number): void {
    for (const [key, story] of this.trackedStories) {
      if (now - story.startTime > 600 && story.id !== this.currentFocus) {
        this.trackedStories.delete(key);
      }
    }
  }

  getCurrentFocus(): string | null {
    return this.currentFocus;
  }

  getFocusCount(): number {
    return this.focusHistory.length;
  }

  getRecentFocus(): string[] {
    return [...this.focusHistory];
  }

  reset(): void {
    this.trackedStories.clear();
    this.currentFocus = null;
    this.focusSince = 0;
    this.focusHistory = [];
  }
}
