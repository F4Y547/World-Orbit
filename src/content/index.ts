export {
  createTimeline,
  startRecording,
  recordEvent,
  stopRecording,
  getStoryDuration,
  getStoryDaySpan,
  getEventCountByKind,
  getActorInvolvement,
  getTensionClimax,
  cleanupOldStories,
  type RecordedStory,
  type StoryTimeline,
  type TimelineEntry,
} from './recorder';

export {
  HighlightDetector,
  type HighlightCandidate,
  type HighlightTier,
  type HighlightDetectorConfig,
} from './highlightDetector';

export {
  buildCinematicReplay,
  getModeDuration,
  type CinematicReplay,
  type ReplayFrame,
  type ReplayMode,
} from './replay';

export {
  generateContentPack,
  generateHook,
  generateTitle,
  generateShortTitle,
  generateThumbnailText,
  generateHashtags,
  type ContentPack,
} from './packaging';

export {
  createArchive,
  archiveStory,
  getFeaturedStories,
  getStoriesByTier,
  getRecentStories,
  searchStories,
  getStoryStats,
  incrementViewCount,
  type ArchivedStory,
  type StoryArchive,
} from './archive';

export {
  createQueue,
  addToQueue,
  updateQueueStatus,
  markRendered,
  markExported,
  getPendingItems,
  getReadyItems,
  getReviewingItems,
  getExportedItems,
  getQueueStats,
  removeFromQueue,
  cleanupQueue,
  type ContentQueue,
  type QueueItem,
  type QueueStatus,
} from './queue';

export {
  generateWhatYouMissed,
  formatWhatYouMissed,
  type WhatYouMissed,
  type WhatYouMissedEvent,
} from './whatYouMissed';

export {
  createAnalyticsStore,
  collectContentMetrics,
  trackHookPerformance,
  trackCountryPerformance,
  getBestHooks,
  getBestCountries,
  getMetricsHistory,
  type ContentMetrics,
  type ContentAnalyticsStore,
} from './analytics';
