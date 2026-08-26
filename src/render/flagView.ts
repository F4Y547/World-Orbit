import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { CONFIG } from '../config';
import type { OrbitBody } from '../sim/types';
import type { Rng } from '../core/rng';

interface TrailPoint {
  x: number;
  y: number;
}

export class FlagView {
  readonly container: Container;
  readonly trail: Graphics;
  private glow: Sprite;
  private accent: number;
  private phase: number;
  private warMix = 0;
  private pts: TrailPoint[] = [];

  constructor(
    parent: Container,
    body: OrbitBody,
    tex: Texture,
    glowTex: Texture,
    rng: Rng,
  ) {
    this.accent = body.def.accent;
    this.phase = rng() * Math.PI * 2;
    const w = CONFIG.flagWidths[body.def.tier];
    const h = w * (tex.height / tex.width);

    this.container = new Container();

    this.glow = new Sprite(glowTex);
    this.glow.anchor.set(0.5);
    this.glow.scale.set((w * 1.9) / glowTex.width);
    this.glow.tint = this.accent;
    this.glow.blendMode = 'add';
    this.glow.alpha = 0.5;

    const flag = new Sprite(tex);
    flag.anchor.set(0.5);
    flag.width = w;
    flag.height = h;

    const border = new Graphics()
      .roundRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 8)
      .stroke({ width: 5, color: 0x04060e, alpha: 0.65 })
      .roundRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 8)
      .stroke({ width: 2, color: 0xdfeaff, alpha: 0.32 });

    this.container.addChild(this.glow, flag, border);
    parent.addChild(this.container);

    this.trail = new Graphics();
    this.trail.blendMode = 'add';
    parent.addChild(this.trail);
  }

  pushTrailPoint(x: number, y: number): void {
    this.pts.push({ x, y });
    if (this.pts.length > CONFIG.physics.trailPoints) this.pts.shift();
  }

  sync(body: OrbitBody, time: number): void {
    const warTarget = body.state === 'war' ? 1 : 0;
    this.warMix += (warTarget - this.warMix) * 0.06;

    const shakeAmp = this.warMix * 2.2 + (body.state === 'defeat' ? 0.6 : 0);
    const sx = Math.sin(time * 31 + this.phase) * shakeAmp;
    const sy = Math.cos(time * 27 + this.phase * 1.7) * shakeAmp;
    this.container.position.set(body.x + sx, body.y + sy);
    this.container.scale.set(body.scale * body.sizeRatio);

    const depth01 = (body.depth + 1) / 2;
    const alpha = (0.55 + depth01 * 0.45) * (body.state === 'defeat' ? 0.72 : 1);
    this.container.alpha = alpha;
    this.container.rotation = Math.sin(time * 0.9 + this.phase) * 0.03;

    const glowPulse =
      0.38 + 0.13 * Math.sin(time * (1.8 + this.warMix * 4.5) + this.phase);
    this.glow.alpha = glowPulse * (0.55 + depth01 * 0.45) * (1 + this.warMix * 0.9);

    const warColor = 0xff3b3b;
    const ar = (this.accent >> 16) & 255;
    const ag = (this.accent >> 8) & 255;
    const ab = this.accent & 255;
    const br = (warColor >> 16) & 255;
    const bg = (warColor >> 8) & 255;
    const bb = warColor & 255;
    const r = Math.round(ar + (br - ar) * this.warMix);
    const g = Math.round(ag + (bg - ag) * this.warMix);
    const bch = Math.round(ab + (bb - ab) * this.warMix);
    this.glow.tint = (r << 16) | (g << 8) | bch;
    this.glow.scale.set(
      ((CONFIG.flagWidths[body.def.tier] * 1.9) / this.glow.texture.width) *
        body.sizeRatio *
        (1 + 0.06 * Math.sin(time * 1.3 + this.phase)) *
        (1 + this.warMix * 0.25),
    );

    const z = Math.round(body.depth * 600);
    this.container.zIndex = z;
    this.trail.zIndex = z - 1;
    this.drawTrail(depth01);
  }

  private drawTrail(depth01: number): void {
    const g = this.trail;
    g.clear();
    const n = this.pts.length;
    if (n < 2) return;
    const maxA = 0.34 * (0.45 + depth01 * 0.55);
    for (let i = 1; i < n; i++) {
      const f = i / n;
      g.moveTo(this.pts[i - 1].x, this.pts[i - 1].y);
      g.lineTo(this.pts[i].x, this.pts[i].y);
      g.stroke({ width: 1 + 5.5 * f * f, color: this.accent, alpha: maxA * f * f });
    }
  }
}
