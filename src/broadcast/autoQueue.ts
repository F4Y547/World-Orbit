import type { StoryTier } from '../sim/types';

export type AutoQueueStatus = 'pending' | 'generating' | 'ready' | 'reviewing' | 'exported';

export interface AutoQueueItem {
  id: string;
  storyId: string;
  headline: string;
  tier: StoryTier;
  score: number;
  status: AutoQueueStatus;
  createdAt: number;
  updatedAt: number;
  replayGenerated: boolean;
  shortGenerated: boolean;
  thumbnailGenerated: boolean;
  packagingDone: boolean;
  renderAttempts: number;
  lastError: string | null;
}

export class AutoHighlightQueue {
  private items: AutoQueueItem[] = [];
  private maxPending = 20;
  private maxGenerating = 5;

  autoEnqueue(storyId: string, headline: string, tier: StoryTier, score: number, time: number): AutoQueueItem | null {
    if (score < 90) return null;
    if (this.items.filter((i) => i.status === 'pending').length >= this.maxPending) return null;
    if (this.items.some((i) => i.storyId === storyId)) return null;

    const item: AutoQueueItem = {
      id: `auto-${storyId}-${time}`,
      storyId,
      headline,
      tier,
      score,
      status: 'pending',
      createdAt: time,
      updatedAt: time,
      replayGenerated: false,
      shortGenerated: false,
      thumbnailGenerated: false,
      packagingDone: false,
      renderAttempts: 0,
      lastError: null,
    };
    this.items.push(item);
    return item;
  }

  getNextToGenerate(): AutoQueueItem | null {
    const pending = this.items.filter((i) => i.status === 'pending');
    if (pending.length === 0) return null;
    const generating = this.items.filter((i) => i.status === 'generating').length;
    if (generating >= this.maxGenerating) return null;
    return pending.sort((a, b) => b.score - a.score)[0];
  }

  markGenerating(id: string, time: number): void {
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.status = 'generating';
      item.updatedAt = time;
    }
  }

  markComplete(id: string, time: number): void {
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.replayGenerated = true;
      item.shortGenerated = true;
      item.thumbnailGenerated = true;
      item.packagingDone = true;
      item.status = 'ready';
      item.updatedAt = time;
    }
  }

  markFailed(id: string, error: string, time: number): void {
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.renderAttempts++;
      item.lastError = error;
      item.updatedAt = time;
      if (item.renderAttempts >= 3) {
        item.status = 'reviewing';
      } else {
        item.status = 'pending';
      }
    }
  }

  approve(id: string, time: number): void {
    const item = this.items.find((i) => i.id === id);
    if (item && item.status === 'ready') {
      item.status = 'reviewing';
      item.updatedAt = time;
    }
  }

  exportItem(id: string, time: number): void {
    const item = this.items.find((i) => i.id === id);
    if (item && item.status === 'reviewing') {
      item.status = 'exported';
      item.updatedAt = time;
    }
  }

  getStats(): { total: number; pending: number; generating: number; ready: number; reviewing: number; exported: number; failed: number } {
    return {
      total: this.items.length,
      pending: this.items.filter((i) => i.status === 'pending').length,
      generating: this.items.filter((i) => i.status === 'generating').length,
      ready: this.items.filter((i) => i.status === 'ready').length,
      reviewing: this.items.filter((i) => i.status === 'reviewing').length,
      exported: this.items.filter((i) => i.status === 'exported').length,
      failed: this.items.filter((i) => i.lastError !== null && i.renderAttempts >= 3).length,
    };
  }

  getItems(status?: AutoQueueStatus): AutoQueueItem[] {
    if (status) return this.items.filter((i) => i.status === status);
    return [...this.items];
  }

  prune(maxAge: number): void {
    this.items = this.items.filter(
      (i) => i.status !== 'exported' || i.updatedAt > Date.now() - maxAge,
    );
  }

  reset(): void {
    this.items = [];
  }
}
