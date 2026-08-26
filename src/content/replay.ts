import type { RecordedStory, TimelineEntry } from './recorder';
import type { ContentPack } from './packaging';

export type ReplayMode = 'full' | 'highlight' | 'short' | 'ultra-short';

export interface ReplayFrame {
  time: number;
  entryIndex: number;
  entry: TimelineEntry | null;
  camera: {
    x: number;
    y: number;
    zoom: number;
    shake: number;
  };
  tension: number;
  headline: string | null;
  announcement: string | null;
  spectacleFlash: boolean;
  spectacleColor: number;
  audioCue: string | null;
  audioIntensity: number;
}

export interface CinematicReplay {
  storyId: string;
  mode: ReplayMode;
  frames: ReplayFrame[];
  duration: number;
  metadata: {
    title: string;
    hook: string;
    score: number;
    countries: string[];
    entryCount: number;
  };
}

const MODE_DURATIONS: Record<ReplayMode, { min: number; max: number }> = {
  'full': { min: 180, max: 600 },
  'highlight': { min: 30, max: 90 },
  'short': { min: 15, max: 60 },
  'ultra-short': { min: 8, max: 15 },
};

const FLASH_COLORS: Record<string, number> = {
  'war-declared': 0xffffff,
  'victory': 0xffd700,
  'betrayal': 0xff4444,
  'mystery': 0x9b59b6,
  'mystery-resolve': 0x9b59b6,
  'massive-alliance': 0x3498db,
  'transformation': 0xf39c12,
  'new-era': 0xf1c40f,
};

const AUDIO_CUES: Record<string, string> = {
  'war-declared': 'war',
  'victory': 'victory',
  'battle': 'battle',
  'mystery': 'mystery',
  'mystery-resolve': 'mystery',
  'betrayal': 'betrayal',
  'alliance-form': 'alliance',
  'massive-alliance': 'alliance',
  'economic-crisis': 'crisis',
  'superpower-crisis': 'crisis',
  'rebellion': 'escalation',
  'new-era': 'resolution',
  'transformation': 'resolution',
};

export function buildCinematicReplay(
  story: RecordedStory,
  mode: ReplayMode,
  pack: ContentPack,
): CinematicReplay {
  const frames: ReplayFrame[] = [];
  const durationRange = MODE_DURATIONS[mode];

  const storyDuration = story.endTime - story.startTime;
  const targetDuration = Math.max(
    durationRange.min,
    Math.min(durationRange.max, storyDuration),
  );

  const timeScale = targetDuration / Math.max(1, storyDuration);
  const frameInterval = mode === 'ultra-short' ? 0.5 : mode === 'short' ? 1 : 2;

  const tensionClimax = story.tensionTimeline.length > 0
    ? story.tensionTimeline.reduce((max, t) => t.value > max.value ? t : max)
    : null;

  void tensionClimax;

  let lastHeadline: string | null = null;
  let lastAnnouncement: string | null = null;
  let flashTimer = 0;

  for (let t = 0; t <= targetDuration; t += frameInterval) {
    const simTime = story.startTime + t / timeScale;
    const entryIdx = findClosestEntry(story.entries, simTime);
    const entry = entryIdx >= 0 ? story.entries[entryIdx] : null;

    const tension = interpolateTension(story.tensionTimeline, simTime);

    const headline = entry && lastHeadline !== entry.headline ? entry.headline : null;
    if (headline && entry) lastHeadline = entry.headline;

    let announcement: string | null = null;
    if (entry && headline) {
      announcement = headline;
    }

    const spectacleFlash = flashTimer > 0;
    if (entry && FLASH_COLORS[entry.kind]) {
      flashTimer = entry.spectacleTier === 'legendary' ? 3 : entry.spectacleTier === 'rare' ? 2 : 1;
    }
    flashTimer = Math.max(0, flashTimer - frameInterval);

    const audioCue = entry ? AUDIO_CUES[entry.kind] ?? null : null;
    const audioIntensity = entry ? entry.spectacleIntensity : 0;

    const progress = t / targetDuration;
    const tensionArc = Math.sin(progress * Math.PI) * 0.5 + 0.5;
    const baseZoom = 1.0 + tensionArc * 0.8;
    const zoom = entry ? baseZoom + entry.spectacleIntensity * 0.5 : baseZoom;

    const shake = spectacleFlash ? (entry?.tension ?? 50) / 10 : 0;

    frames.push({
      time: t,
      entryIndex: entryIdx,
      entry,
      camera: {
        x: 0,
        y: 0,
        zoom,
        shake,
      },
      tension,
      headline,
      announcement,
      spectacleFlash,
      spectacleColor: entry ? (FLASH_COLORS[entry.kind] ?? 0xffffff) : 0xffffff,
      audioCue,
      audioIntensity,
    });
  }

  return {
    storyId: story.id,
    mode,
    frames,
    duration: targetDuration,
    metadata: {
      title: pack.title,
      hook: pack.hook,
      score: story.storyScore,
      countries: story.actors,
      entryCount: story.entries.length,
    },
  };
}

function findClosestEntry(entries: TimelineEntry[], time: number): number {
  if (entries.length === 0) return -1;
  let best = 0;
  let bestDist = Math.abs(entries[0].time - time);
  for (let i = 1; i < entries.length; i++) {
    const dist = Math.abs(entries[i].time - time);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}

function interpolateTension(timeline: Array<{ time: number; value: number }>, time: number): number {
  if (timeline.length === 0) return 0;
  if (time <= timeline[0].time) return timeline[0].value;
  if (time >= timeline[timeline.length - 1].time) return timeline[timeline.length - 1].value;

  for (let i = 1; i < timeline.length; i++) {
    if (time <= timeline[i].time) {
      const t = (time - timeline[i - 1].time) / (timeline[i].time - timeline[i - 1].time);
      return timeline[i - 1].value + t * (timeline[i].value - timeline[i - 1].value);
    }
  }
  return timeline[timeline.length - 1].value;
}

function interpolatePowers(timeline: Array<{ time: number; powers: Record<string, number> }>, time: number): Record<string, number> {
  if (timeline.length === 0) return {};
  if (time <= timeline[0].time) return { ...timeline[0].powers };
  if (time >= timeline[timeline.length - 1].time) return { ...timeline[timeline.length - 1].powers };

  for (let i = 1; i < timeline.length; i++) {
    if (time <= timeline[i].time) {
      const t = (time - timeline[i - 1].time) / (timeline[i].time - timeline[i - 1].time);
      const result: Record<string, number> = {};
      for (const key of Object.keys(timeline[i].powers)) {
        const prev = timeline[i - 1].powers[key] ?? 0;
        const curr = timeline[i].powers[key] ?? 0;
        result[key] = prev + t * (curr - prev);
      }
      return result;
    }
  }
  return { ...timeline[timeline.length - 1].powers };
}

export function getModeDuration(mode: ReplayMode): { min: number; max: number } {
  return MODE_DURATIONS[mode];
}
