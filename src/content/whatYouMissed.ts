import type { ArchivedStory } from './archive';

export interface WhatYouMissedEvent {
  storyId: string;
  headline: string;
  emoji: string;
  countries: string[];
  day: number;
  timeAgo: number;
  score: number;
}

export interface WhatYouMissed {
  events: WhatYouMissedEvent[];
  biggestEvent: WhatYouMissedEvent | null;
  totalEvents: number;
  timeSpan: string;
  summary: string;
}

export function generateWhatYouMissed(
  recentStories: ArchivedStory[],
  currentTime: number,
): WhatYouMissed {
  if (recentStories.length === 0) {
    return {
      events: [],
      biggestEvent: null,
      totalEvents: 0,
      timeSpan: 'No recent events',
      summary: 'The world has been quiet while you were away.',
    };
  }

  const sorted = recentStories.sort((a, b) => b.story.storyScore - a.story.storyScore);
  const biggest = sorted[0];

  const events: WhatYouMissedEvent[] = sorted.slice(0, 6).map((s) => ({
    storyId: s.id,
    headline: s.story.entries[s.story.entries.length - 1]?.headline ?? 'World event',
    emoji: getEventEmoji(s),
    countries: s.story.actors,
    day: s.story.endDay,
    timeAgo: currentTime - s.story.endTime,
    score: s.story.storyScore,
  }));

  const timeSpanMs = sorted[0].story.endTime - sorted[sorted.length - 1].story.startTime;
  const timeSpan = formatTimeSpan(timeSpanMs);

  const summaryLines = [
    `${sorted.length} significant events occurred`,
    `Biggest event: ${biggest.content.shortTitle} (${biggest.story.storyScore.toFixed(0)}/100)`,
  ];

  return {
    events,
    biggestEvent: events[0] ?? null,
    totalEvents: recentStories.length,
    timeSpan,
    summary: summaryLines.join('. '),
  };
}

function getEventEmoji(story: ArchivedStory): string {
  const kinds = new Set(story.story.entries.map((e) => e.kind));
  if (kinds.has('war-declared')) return '⚔️';
  if (kinds.has('victory')) return '🏆';
  if (kinds.has('betrayal')) return '🗡';
  if (kinds.has('mystery') || kinds.has('mystery-resolve')) return '❓';
  if (kinds.has('superpower-crisis')) return '💥';
  if (kinds.has('alliance-form') || kinds.has('massive-alliance')) return '🌐';
  if (kinds.has('peace')) return '🕊';
  if (kinds.has('economic-crisis')) return '📉';
  if (kinds.has('boom')) return '📈';
  if (kinds.has('leadership-change')) return '👤';
  return '🌍';
}

function formatTimeSpan(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  return `${Math.round(seconds / 86400)} days`;
}

export function formatWhatYouMissed(wym: WhatYouMissed): string {
  if (wym.events.length === 0) return '🌍 The world has been quiet while you were away.';

  const lines = [
    `🌎 WHILE YOU WERE AWAY (${wym.timeSpan})`,
    ``,
  ];

  for (const event of wym.events) {
    const timeAgoStr = formatTimeSpan(event.timeAgo * 1000);
    lines.push(`${event.emoji} ${event.countries.join(' ')} — ${event.headline} (${timeAgoStr} ago)`);
  }

  if (wym.biggestEvent) {
    lines.push(``);
    lines.push(`🔥 BIGGEST EVENT: ${wym.biggestEvent.score.toFixed(0)}/100`);
    lines.push(`▶ WATCH REPLAY`);
  }

  return lines.join('\n');
}
