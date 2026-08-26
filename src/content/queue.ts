import type { ArchivedStory } from './archive';

export type QueueStatus = 'pending' | 'generating' | 'ready' | 'reviewing' | 'exported' | 'archived';

export interface QueueItem {
  id: string;
  storyId: string;
  status: QueueStatus;
  createdAt: number;
  updatedAt: number;
  content: {
    title: string;
    shortTitle: string;
    hook: string;
    thumbnailText: string;
    hashtags: string[];
    tier: string;
    score: number;
  };
  render: {
    shortReady: boolean;
    replayReady: boolean;
    thumbnailReady: boolean;
    shortPath: string | null;
    replayPath: string | null;
    thumbnailPath: string | null;
  };
  export: {
    exportedAt: number | null;
    platform: string | null;
    url: string | null;
  };
}

export interface ContentQueue {
  items: QueueItem[];
  nextId: number;
}

export function createQueue(): ContentQueue {
  return {
    items: [],
    nextId: 1,
  };
}

export function addToQueue(queue: ContentQueue, story: ArchivedStory): QueueItem {
  const item: QueueItem = {
    id: `queue-${queue.nextId++}`,
    storyId: story.id,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    content: {
      title: story.content.title,
      shortTitle: story.content.shortTitle,
      hook: story.content.hook,
      thumbnailText: story.content.thumbnailText,
      hashtags: story.content.hashtags,
      tier: story.content.tier,
      score: story.content.storyScore,
    },
    render: {
      shortReady: false,
      replayReady: false,
      thumbnailReady: false,
      shortPath: null,
      replayPath: null,
      thumbnailPath: null,
    },
    export: {
      exportedAt: null,
      platform: null,
      url: null,
    },
  };

  queue.items.push(item);
  return item;
}

export function updateQueueStatus(queue: QueueQueue, itemId: string, status: QueueStatus): boolean {
  const item = queue.items.find((i) => i.id === itemId);
  if (!item) return false;
  item.status = status;
  item.updatedAt = Date.now();
  return true;
}

export function markRendered(queue: ContentQueue, itemId: string, type: 'short' | 'replay' | 'thumbnail', path: string): boolean {
  const item = queue.items.find((i) => i.id === itemId);
  if (!item) return false;
  if (type === 'short') { item.render.shortReady = true; item.render.shortPath = path; }
  if (type === 'replay') { item.render.replayReady = true; item.render.replayPath = path; }
  if (type === 'thumbnail') { item.render.thumbnailReady = true; item.render.thumbnailPath = path; }
  item.updatedAt = Date.now();
  return true;
}

export function markExported(queue: ContentQueue, itemId: string, platform: string, url: string): boolean {
  const item = queue.items.find((i) => i.id === itemId);
  if (!item) return false;
  item.export = { exportedAt: Date.now(), platform, url };
  item.status = 'exported';
  item.updatedAt = Date.now();
  return true;
}

export function getPendingItems(queue: ContentQueue): QueueItem[] {
  return queue.items.filter((i) => i.status === 'pending');
}

export function getReadyItems(queue: ContentQueue): QueueItem[] {
  return queue.items.filter((i) => i.status === 'ready');
}

export function getReviewingItems(queue: ContentQueue): QueueItem[] {
  return queue.items.filter((i) => i.status === 'reviewing');
}

export function getExportedItems(queue: ContentQueue): QueueItem[] {
  return queue.items.filter((i) => i.status === 'exported');
}

export function getQueueStats(queue: ContentQueue): {
  total: number;
  byStatus: Record<QueueStatus, number>;
  fullyRendered: number;
  readyForExport: number;
} {
  const byStatus: Record<QueueStatus, number> = { pending: 0, generating: 0, ready: 0, reviewing: 0, exported: 0, archived: 0 };
  let fullyRendered = 0;
  let readyForExport = 0;

  for (const item of queue.items) {
    byStatus[item.status]++;
    if (item.render.shortReady && item.render.replayReady && item.render.thumbnailReady) {
      fullyRendered++;
      if (item.status === 'ready' || item.status === 'reviewing') readyForExport++;
    }
  }

  return { total: queue.items.length, byStatus, fullyRendered, readyForExport };
}

export function removeFromQueue(queue: ContentQueue, itemId: string): boolean {
  const idx = queue.items.findIndex((i) => i.id === itemId);
  if (idx < 0) return false;
  queue.items.splice(idx, 1);
  return true;
}

export function cleanupQueue(queue: ContentQueue, maxAge: number = 2592000000): number {
  const cutoff = Date.now() - maxAge;
  const before = queue.items.length;
  queue.items = queue.items.filter((i) => i.createdAt > cutoff || i.status === 'exported');
  return before - queue.items.length;
}

type QueueQueue = ContentQueue;
