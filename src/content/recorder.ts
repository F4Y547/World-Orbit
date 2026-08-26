import type { EventKind, SimEvent, StoryTier, WorldState } from '../sim/types';

export interface TimelineEntry {
  index: number;
  time: number;
  day: number;
  kind: EventKind;
  actorA: string;
  actorB: string;
  delta: number;
  headline: string;
  tension: number;
  spectacleIntensity: number;
  spectacleTier: StoryTier;
  powerSnapshot: Map<string, number>;
}

export interface RecordedStory {
  id: string;
  startTime: number;
  endTime: number;
  startDay: number;
  endDay: number;
  entries: TimelineEntry[];
  actors: string[];
  peakTension: number;
  peakSpectacle: number;
  storyScore: number;
  tensionTimeline: Array<{ time: number; value: number }>;
  powerTimeline: Array<{ time: number; powers: Record<string, number> }>;
}

export interface StoryTimeline {
  stories: RecordedStory[];
  activeStoryId: string | null;
  nextStoryId: number;
}

export function createTimeline(): StoryTimeline {
  return {
    stories: [],
    activeStoryId: null,
    nextStoryId: 1,
  };
}

export function startRecording(timeline: StoryTimeline, w: WorldState, actors: string[], label?: string): string {
  const id = label ?? `story-${timeline.nextStoryId++}`;
  const powerSnapshot = new Map<string, number>();
  for (const c of w.countries) powerSnapshot.set(c.def.id, c.power);

  const story: RecordedStory = {
    id,
    startTime: w.time,
    endTime: w.time,
    startDay: w.day,
    endDay: w.day,
    entries: [],
    actors: [...actors],
    peakTension: 0,
    peakSpectacle: 0,
    storyScore: 0,
    tensionTimeline: [{ time: w.time, value: 0 }],
    powerTimeline: [{ time: w.time, powers: Object.fromEntries(powerSnapshot) }],
  };

  timeline.stories.push(story);
  timeline.activeStoryId = id;
  return id;
}

export function recordEvent(
  timeline: StoryTimeline,
  w: WorldState,
  event: SimEvent,
  tension: number,
): void {
  if (!timeline.activeStoryId) return;
  const story = timeline.stories.find((s) => s.id === timeline.activeStoryId);
  if (!story) return;

  const powerSnapshot = new Map<string, number>();
  for (const c of w.countries) powerSnapshot.set(c.def.id, c.power);

  const entry: TimelineEntry = {
    index: story.entries.length,
    time: w.time,
    day: w.day,
    kind: event.kind,
    actorA: event.actorA,
    actorB: event.actorB,
    delta: event.delta,
    headline: event.headline,
    tension,
    spectacleIntensity: event.spectacle?.intensity ?? 0,
    spectacleTier: event.spectacle?.tier ?? 'common',
    powerSnapshot,
  };

  story.entries.push(entry);
  story.endTime = w.time;
  story.endDay = w.day;
  story.peakTension = Math.max(story.peakTension, tension);
  story.peakSpectacle = Math.max(story.peakSpectacle, entry.spectacleIntensity);

  story.tensionTimeline.push({ time: w.time, value: tension });
  if (story.tensionTimeline.length > 200) story.tensionTimeline.shift();

  story.powerTimeline.push({ time: w.time, powers: Object.fromEntries(powerSnapshot) });
  if (story.powerTimeline.length > 200) story.powerTimeline.shift();

  if (!story.actors.includes(event.actorA)) story.actors.push(event.actorA);
  if (event.actorB && !story.actors.includes(event.actorB)) story.actors.push(event.actorB);
}

export function stopRecording(timeline: StoryTimeline, storyScore: number): RecordedStory | null {
  if (!timeline.activeStoryId) return null;
  const story = timeline.stories.find((s) => s.id === timeline.activeStoryId);
  if (!story) return null;

  story.storyScore = storyScore;
  timeline.activeStoryId = null;
  return story;
}

export function getStoryDuration(story: RecordedStory): number {
  return story.endTime - story.startTime;
}

export function getStoryDaySpan(story: RecordedStory): number {
  return story.endDay - story.startDay + 1;
}

export function getEventCountByKind(story: RecordedStory): Map<EventKind, number> {
  const counts = new Map<EventKind, number>();
  for (const entry of story.entries) {
    counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
  }
  return counts;
}

export function getActorInvolvement(story: RecordedStory): Map<string, number> {
  const involvement = new Map<string, number>();
  for (const entry of story.entries) {
    involvement.set(entry.actorA, (involvement.get(entry.actorA) ?? 0) + 1);
    if (entry.actorB) {
      involvement.set(entry.actorB, (involvement.get(entry.actorB) ?? 0) + 1);
    }
  }
  return involvement;
}

export function getTensionClimax(story: RecordedStory): { time: number; value: number } | null {
  if (story.tensionTimeline.length === 0) return null;
  return story.tensionTimeline.reduce((max, t) => t.value > max.value ? t : max);
}

export function cleanupOldStories(timeline: StoryTimeline, maxAge: number = 604800000): number {
  const cutoff = Date.now() / 1000 - maxAge / 1000;
  const before = timeline.stories.length;
  timeline.stories = timeline.stories.filter((s) => s.endTime > cutoff);
  return before - timeline.stories.length;
}
