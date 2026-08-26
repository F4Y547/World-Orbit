import type { RecordedStory } from './recorder';
import type { ContentPack } from './packaging';
import type { HighlightCandidate } from './highlightDetector';
import type { CinematicReplay } from './replay';

export interface ArchivedStory {
  id: string;
  story: RecordedStory;
  content: ContentPack;
  highlight: HighlightCandidate;
  replay: CinematicReplay | null;
  archivedAt: number;
  featured: boolean;
  viewCount: number;
}

export interface StoryArchive {
  stories: ArchivedStory[];
  featured: ArchivedStory[];
  byTier: Map<string, ArchivedStory[]>;
}

export function createArchive(): StoryArchive {
  return {
    stories: [],
    featured: [],
    byTier: new Map(),
  };
}

export function archiveStory(
  archive: StoryArchive,
  story: RecordedStory,
  content: ContentPack,
  highlight: HighlightCandidate,
  replay: CinematicReplay | null = null,
): ArchivedStory {
  const archived: ArchivedStory = {
    id: story.id,
    story,
    content,
    highlight,
    replay,
    archivedAt: Date.now(),
    featured: highlight.tier === 'legendary',
    viewCount: 0,
  };

  archive.stories.push(archived);

  if (archived.featured) {
    archive.featured.push(archived);
  }

  const tier = highlight.tier;
  const tierList = archive.byTier.get(tier) ?? [];
  tierList.push(archived);
  archive.byTier.set(tier, tierList);

  return archived;
}

export function getFeaturedStories(archive: StoryArchive, limit: number = 10): ArchivedStory[] {
  return archive.featured
    .sort((a, b) => b.story.storyScore - a.story.storyScore)
    .slice(0, limit);
}

export function getStoriesByTier(archive: StoryArchive, tier: string): ArchivedStory[] {
  return archive.byTier.get(tier) ?? [];
}

export function getRecentStories(archive: StoryArchive, limit: number = 20): ArchivedStory[] {
  return archive.stories
    .sort((a, b) => b.archivedAt - a.archivedAt)
    .slice(0, limit);
}

export function searchStories(archive: StoryArchive, query: string): ArchivedStory[] {
  const q = query.toLowerCase();
  return archive.stories.filter((s) =>
    s.content.title.toLowerCase().includes(q) ||
    s.content.hook.toLowerCase().includes(q) ||
    s.story.actors.some((a) => a.toLowerCase().includes(q)) ||
    s.content.summary.toLowerCase().includes(q)
  );
}

export function getStoryStats(archive: StoryArchive): {
  total: number;
  featured: number;
  averageScore: number;
  totalViews: number;
  byTier: Record<string, number>;
  bestCountries: Array<{ country: string; count: number; avgScore: number }>;
} {
  const byTier: Record<string, number> = {};
  for (const [tier, stories] of archive.byTier) {
    byTier[tier] = stories.length;
  }

  let totalScore = 0;
  let totalViews = 0;
  const countryStats = new Map<string, { count: number; totalScore: number }>();

  for (const s of archive.stories) {
    totalScore += s.story.storyScore;
    totalViews += s.viewCount;
    for (const actor of s.story.actors) {
      const existing = countryStats.get(actor) ?? { count: 0, totalScore: 0 };
      existing.count++;
      existing.totalScore += s.story.storyScore;
      countryStats.set(actor, existing);
    }
  }

  const bestCountries = Array.from(countryStats.entries())
    .map(([country, stats]) => ({
      country,
      count: stats.count,
      avgScore: stats.totalScore / Math.max(1, stats.count),
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 10);

  return {
    total: archive.stories.length,
    featured: archive.featured.length,
    averageScore: archive.stories.length > 0 ? totalScore / archive.stories.length : 0,
    totalViews,
    byTier,
    bestCountries,
  };
}

export function incrementViewCount(archive: StoryArchive, storyId: string): void {
  const story = archive.stories.find((s) => s.id === storyId);
  if (story) story.viewCount++;
}
