import type { WorldState } from '../sim/types';

export interface ViewerArrival {
  viewerId: string;
  arrivalTime: number;
  previousViewings: number;
  lastSeenDay: number;
  currentDay: number;
  daysAway: number;
}

export interface ArrivalExperience {
  viewerId: string;
  liveUptime: string;
  whileYouWereAway: RecapItem[];
  currently: string;
  predictionPrompt: string;
  recapDuration: number;
  startedAt: number;
}

export interface RecapItem {
  icon: string;
  headline: string;
  day: number;
  tier: string;
}

export class ViewerArrivalSystem {
  private viewers: Map<string, ViewerArrival> = new Map();

  registerViewer(id: string, currentDay: number): ViewerArrival {
    const existing = this.viewers.get(id);
    const arrival: ViewerArrival = {
      viewerId: id,
      arrivalTime: Date.now(),
      previousViewings: existing?.previousViewings ?? 0,
      lastSeenDay: existing?.lastSeenDay ?? currentDay,
      currentDay,
      daysAway: currentDay - (existing?.lastSeenDay ?? currentDay),
    };
    this.viewers.set(id, arrival);
    return arrival;
  }

  buildExperience(
    viewer: ViewerArrival,
    world: WorldState,
    uptimeMs: number,
  ): ArrivalExperience {
    const uptimeH = Math.floor(uptimeMs / 3600000);
    const uptimeM = Math.floor((uptimeMs % 3600000) / 60000);

    const recentEvents = world.news
      .filter((e) => e.day > viewer.lastSeenDay)
      .slice(-5)
      .map((e) => ({
        icon: this.eventIcon(e.kind),
        headline: e.headline ?? 'Unknown event',
        day: e.day,
        tier: e.kind,
      }));

    const tension = world.story?.boredom?.tensionAccumulator ?? 0;
    let currently = '🟢 Calm period';
    let hasActiveWar = false;
    for (const [, war] of world.wars) {
      if (war.outcome === null) {
        currently = `⚔️ Active war: ${war.attackerId} vs ${war.defenderId}`;
        hasActiveWar = true;
        break;
      }
    }
    if (!hasActiveWar && tension > 0.7) {
      currently = '🔴 CRITICAL TENSION';
    } else if (!hasActiveWar && tension > 0.4) {
      currently = '🟡 Tension rising';
    }

    return {
      viewerId: viewer.viewerId,
      liveUptime: `${uptimeH}h ${uptimeM}m`,
      whileYouWereAway: recentEvents,
      currently,
      predictionPrompt: '🔮 WHAT HAPPENS NEXT?',
      recapDuration: Math.min(60, recentEvents.length * 12),
      startedAt: Date.now(),
    };
  }

  private eventIcon(kind: string): string {
    if (kind === 'war' || kind === 'battle') return '⚔️';
    if (kind === 'alliance') return '🤝';
    if (kind === 'rivalry') return '💢';
    if (kind === 'rebellion') return '🔥';
    if (kind === 'coup') return '👑';
    if (kind === 'treaty') return '🕊️';
    return '📰';
  }

  updateViewerDay(id: string, currentDay: number): void {
    const viewer = this.viewers.get(id);
    if (viewer) {
      viewer.currentDay = currentDay;
    }
  }

  getViewerCount(): number {
    return this.viewers.size;
  }

  getRecentViewers(minutes: number): ViewerArrival[] {
    const cutoff = Date.now() - minutes * 60000;
    return [...this.viewers.values()].filter((v) => v.arrivalTime >= cutoff);
  }

  prune(maxAge: number): void {
    const cutoff = Date.now() - maxAge;
    for (const [id, viewer] of this.viewers) {
      if (viewer.arrivalTime < cutoff) {
        this.viewers.delete(id);
      }
    }
  }

  reset(): void {
    this.viewers.clear();
  }
}
