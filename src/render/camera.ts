import { Container } from 'pixi.js';
import { CONFIG } from '../config';
import type { WorldState, War, CountryRuntime } from '../sim/types';

type FocusMode = 'idle' | 'war' | 'event' | 'country' | 'dramatic';
export type CameraPriority = 'background' | 'normal' | 'elevated' | 'critical';

interface PriorityEntry {
  priority: CameraPriority;
  mode: FocusMode;
  timer: number;
  duration: number;
  x?: number;
  y?: number;
  zoom?: number;
  warId?: number;
}

const ZOOM_MIN = 0.85;
const ZOOM_MAX = 2.2;
const SHAKE_DECAY = 0.92;
const PAN_MARGIN = 80;
const PRIORITY_RANK: Record<CameraPriority, number> = {
  background: 0,
  normal: 1,
  elevated: 2,
  critical: 3,
};

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class Camera {
  private container: Container;
  private targetX = 0;
  private targetY = 0;
  private targetZoom = 1;
  private currentX = 0;
  private currentY = 0;
  private currentZoom = 1;
  private shakeX = 0;
  private shakeY = 0;
  private shakeIntensity = 0;
  private focusMode: FocusMode = 'idle';
  private focusTimer = 0;
  private idleNextAt = 0;
  private warFocusId = -1;
  private eventFocusEnd = 0;
  private countryFocusEnd = 0;
  private dramaticEnd = 0;
  private dramaticStartX = 0;
  private dramaticStartY = 0;
  private dramaticStartZoom = 0;
  private dramaticTargetX = 0;
  private dramaticTargetY = 0;
  private dramaticTargetZoom = 0;
  private dramaticDuration = 0;
  private currentPriority: CameraPriority = 'background';
  private priorityQueue: PriorityEntry[] = [];

  get x(): number { return this.currentX; }
  get y(): number { return this.currentY; }

  constructor(container: Container) {
    this.container = container;
    this.currentX = CONFIG.centerX;
    this.currentY = CONFIG.centerY;
    this.currentZoom = 1;
    this.targetX = CONFIG.centerX;
    this.targetY = CONFIG.centerY;
    this.targetZoom = 1;
  }

  shake(intensity: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  setPriority(priority: CameraPriority): void {
    if (PRIORITY_RANK[priority] > PRIORITY_RANK[this.currentPriority]) {
      this.currentPriority = priority;
    }
  }

  focusWar(warId: number): void {
    this.focusMode = 'war';
    this.warFocusId = warId;
    this.focusTimer = 0;
  }

  focusEvent(duration: number, x?: number, y?: number, zoom?: number): void {
    this.focusMode = 'event';
    this.eventFocusEnd = performance.now() / 1000 + duration;
    this.focusTimer = 0;
    if (x !== undefined && y !== undefined) {
      this.setTarget(x, y, zoom ?? CONFIG.camera.eventZoom);
    }
  }

  focusCountry(countryId: string, duration: number, world: WorldState): void {
    const body = this.findBody(world, countryId);
    if (!body) return;
    this.focusMode = 'country';
    this.countryFocusEnd = performance.now() / 1000 + duration;
    this.focusTimer = 0;
    this.setTarget(body.x, body.y, CONFIG.camera.eventZoom);
  }

  dramaticZoom(targetX: number, targetY: number, zoom: number, durationSec: number): void {
    this.focusMode = 'dramatic';
    this.dramaticEnd = performance.now() / 1000 + durationSec;
    this.dramaticStartX = this.currentX;
    this.dramaticStartY = this.currentY;
    this.dramaticStartZoom = this.currentZoom;
    this.dramaticTargetX = clamp(targetX, PAN_MARGIN, CONFIG.width - PAN_MARGIN);
    this.dramaticTargetY = clamp(targetY, PAN_MARGIN, CONFIG.height - PAN_MARGIN);
    this.dramaticTargetZoom = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
    this.dramaticDuration = durationSec;
    this.focusTimer = 0;
  }

  update(dt: number, world: WorldState): void {
    this.focusTimer += dt;
    const now = performance.now() / 1000;

    if (this.focusMode === 'war') {
      const war = world.wars.get(this.warFocusId);
      if (!war || war.outcome) {
        this.focusMode = 'idle';
        this.idleNextAt = 0;
      } else {
        this.updateWarTarget(war, world);
      }
    } else if (this.focusMode === 'event') {
      if (now > this.eventFocusEnd) this.focusMode = 'idle';
    } else if (this.focusMode === 'country') {
      if (now > this.countryFocusEnd) this.focusMode = 'idle';
    } else if (this.focusMode === 'dramatic') {
      const elapsed = now - (this.dramaticEnd - this.dramaticDuration);
      const t = clamp(elapsed / this.dramaticDuration, 0, 1);
      const eased = easeInOutCubic(t);
      this.targetX = this.dramaticStartX + (this.dramaticTargetX - this.dramaticStartX) * eased;
      this.targetY = this.dramaticStartY + (this.dramaticTargetY - this.dramaticStartY) * eased;
      this.targetZoom = this.dramaticStartZoom + (this.dramaticTargetZoom - this.dramaticStartZoom) * eased;
      if (t >= 1) this.focusMode = 'idle';
    }

    if (this.focusMode === 'idle') {
      this.updateIdleTarget(world, now);
    }

    const lerp = this.focusMode === 'dramatic' ? CONFIG.camera.dramaticZoomSpeed : CONFIG.camera.transitionLerp;
    this.currentX += (this.targetX - this.currentX) * lerp;
    this.currentY += (this.targetY - this.currentY) * lerp;
    this.currentZoom += (this.targetZoom - this.currentZoom) * lerp;

    if (this.shakeIntensity > 0.05) {
      this.shakeX = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeY = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeIntensity *= SHAKE_DECAY;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
      this.shakeIntensity = 0;
    }

    this.container.x = CONFIG.centerX + (CONFIG.centerX - this.currentX) * this.currentZoom + this.shakeX;
    this.container.y = CONFIG.centerY + (CONFIG.centerY - this.currentY) * this.currentZoom + this.shakeY;
    this.container.scale.set(this.currentZoom);
  }

  setTarget(x: number, y: number, zoom: number): void {
    this.targetX = clamp(x, PAN_MARGIN, CONFIG.width - PAN_MARGIN);
    this.targetY = clamp(y, PAN_MARGIN, CONFIG.height - PAN_MARGIN);
    this.targetZoom = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
  }

  private updateWarTarget(war: War, world: WorldState): void {
    const a = this.findBody(world, war.attackerId);
    const b = this.findBody(world, war.defenderId);
    if (!a || !b) return;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const zoomFactor = CONFIG.camera.warZoomBase + Math.min(dist / 600, 0.6);
    const intensity = Math.min(1, Math.abs(war.momentum) / 50);
    this.setTarget(mx, my, zoomFactor + intensity * (CONFIG.camera.warZoomClose - CONFIG.camera.warZoomBase));

    if (war.battles.length > 0) {
      const lastBattle = war.battles[war.battles.length - 1];
      if (lastBattle && this.focusTimer - 0.5 < 0.01) {
        this.shake(3 + intensity * 5);
      }
    }
  }

  private updateIdleTarget(world: WorldState, now: number): void {
    if (now < this.idleNextAt) return;

    const activeWars: War[] = [];
    for (const war of world.wars.values()) {
      if (!war.outcome) activeWars.push(war);
    }

    if (activeWars.length > 0) {
      const war = activeWars[Math.floor(Math.random() * activeWars.length)];
      this.focusMode = 'war';
      this.warFocusId = war.id;
      this.focusTimer = 0;
      const [lo, hi] = CONFIG.camera.warFocusSec;
      this.idleNextAt = now + lo + Math.random() * (hi - lo);
      return;
    }

    const targets = this.pickIdleTargets(world);
    const target = targets[Math.floor(Math.random() * targets.length)];
    const [lo, hi] = CONFIG.camera.idleDriftSec;
    this.idleNextAt = now + lo + Math.random() * (hi - lo);

    const zoom = 1 + Math.random() * 0.4;
    this.setTarget(target.x, target.y, zoom);
  }

  private pickIdleTargets(world: WorldState): Array<{ x: number; y: number; zoom: number }> {
    const targets: Array<{ x: number; y: number; zoom: number }> = [
      { x: CONFIG.centerX, y: CONFIG.centerY, zoom: 1 },
    ];
    for (const body of world.bodies) {
      targets.push({ x: body.x, y: body.y, zoom: 1.2 + Math.random() * 0.5 });
    }
    return targets;
  }

  private findBody(world: WorldState, countryId: string): { x: number; y: number } | null {
    for (let i = 0; i < world.countries.length; i++) {
      if (world.countries[i].def.id === countryId) {
        return world.bodies[i];
      }
    }
    return null;
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
