import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SnapshotData } from './snapshot';

const BASE_DIR = join(process.env.HOME ?? '/tmp', '.world-orbit', 'snapshots');

export interface ReplayFrame {
  time: number;
  day: number;
  countries: Array<{
    id: string;
    power: number;
    gdp: number;
    x: number;
    y: number;
  }>;
  wars: Array<{
    id: number;
    attacker: string;
    defender: string;
    momentum: number;
    outcome: string | null;
  }>;
  events: Array<{
    id: number;
    kind: string;
    headline: string;
    actorA: string;
    actorB: string;
    day: number;
  }>;
  tension: number;
}

export interface ReplaySequence {
  id: string;
  seed: number;
  frames: ReplayFrame[];
  duration: number;
  dayCount: number;
}

export class WorldReplay {
  private sequences: Map<string, ReplaySequence> = new Map();
  private currentTime = 0;
  private playing = false;
  private speed = 1;
  private currentSequence: ReplaySequence | null = null;
  private frameIndex = 0;

  loadFromSnapshot(snapshotPath: string): ReplaySequence | null {
    if (!existsSync(snapshotPath)) return null;

    try {
      const raw = readFileSync(snapshotPath, 'utf-8');
      const snapshot: SnapshotData = JSON.parse(raw);
      return this.parseSnapshot(snapshot);
    } catch {
      return null;
    }
  }

  loadLatest(): ReplaySequence | null {
    const latestPath = join(BASE_DIR, 'latest.json');
    return this.loadFromSnapshot(latestPath);
  }

  loadAll(): ReplaySequence[] {
    const results: ReplaySequence[] = [];
    for (const dir of ['hourly', 'daily', 'milestones']) {
      const dirPath = join(BASE_DIR, dir);
      if (!existsSync(dirPath)) continue;
      for (const file of readdirSync(dirPath).filter((f) => f.endsWith('.json'))) {
        const seq = this.loadFromSnapshot(join(dirPath, file));
        if (seq) results.push(seq);
      }
    }
    return results;
  }

  private parseSnapshot(snapshot: SnapshotData): ReplaySequence {
    const w = snapshot.world;
    const frame: ReplayFrame = {
      time: w.time,
      day: w.day,
      countries: w.countries.map((c) => ({
        id: c.id,
        power: c.power,
        gdp: c.gdp,
        x: 0,
        y: 0,
      })),
      wars: w.wars.map((war) => ({
        id: war.id,
        attacker: war.attackerId,
        defender: war.defenderId,
        momentum: war.momentum,
        outcome: war.outcome,
      })),
      events: w.news.slice(-20).map((e) => ({
        id: e.id,
        kind: e.kind,
        headline: e.headline,
        actorA: e.actorA,
        actorB: e.actorB,
        day: e.day,
      })),
      tension: 0,
    };

    return {
      id: `replay-${snapshot.meta.timestamp}`,
      seed: w.seed,
      frames: [frame],
      duration: w.time,
      dayCount: w.day,
    };
  }

  buildTimeline(events: Array<{ time: number; snapshot: SnapshotData }>): ReplaySequence {
    const sorted = events.sort((a, b) => a.time - b.time);
    const frames: ReplayFrame[] = [];

    for (const event of sorted) {
      const parsed = this.parseSnapshot(event.snapshot);
      if (parsed.frames.length > 0) {
        const f = parsed.frames[0];
        f.time = event.time;
        frames.push(f);
      }
    }

    return {
      id: `timeline-${Date.now()}`,
      seed: sorted[0]?.snapshot.world.seed ?? 0,
      frames,
      duration: frames.length > 0 ? frames[frames.length - 1].time - frames[0].time : 0,
      dayCount: frames.length > 0 ? frames[frames.length - 1].day : 0,
    };
  }

  play(sequence: ReplaySequence): void {
    this.currentSequence = sequence;
    this.frameIndex = 0;
    this.currentTime = 0;
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  resume(): void {
    this.playing = true;
  }

  seek(time: number): void {
    this.currentTime = time;
    if (!this.currentSequence) return;
    this.frameIndex = this.findFrameIndex(time);
  }

  tick(dt: number): ReplayFrame | null {
    if (!this.playing || !this.currentSequence) return null;

    this.currentTime += dt * this.speed;
    const frames = this.currentSequence.frames;

    if (this.frameIndex < frames.length - 1) {
      const nextTime = frames[this.frameIndex + 1].time;
      if (this.currentTime >= nextTime) {
        this.frameIndex++;
      }
    }

    return frames[this.frameIndex] ?? null;
  }

  private findFrameIndex(time: number): number {
    if (!this.currentSequence) return 0;
    const frames = this.currentSequence.frames;
    for (let i = frames.length - 1; i >= 0; i--) {
      if (frames[i].time <= time) return i;
    }
    return 0;
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, Math.min(10, speed));
  }

  getCurrentFrame(): ReplayFrame | null {
    return this.currentSequence?.frames[this.frameIndex] ?? null;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getProgress(): number {
    if (!this.currentSequence || this.currentSequence.duration === 0) return 0;
    return this.currentTime / this.currentSequence.duration;
  }

  reset(): void {
    this.currentTime = 0;
    this.playing = false;
    this.currentSequence = null;
    this.frameIndex = 0;
  }
}
