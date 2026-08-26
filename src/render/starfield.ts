import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import { CONFIG } from '../config';
import { pick, type Rng } from '../core/rng';

export class Starfield {
  private tiles: TilingSprite;
  private twinkles: Sprite[] = [];
  private phases: number[] = [];

  constructor(parent: Container, starTex: Texture, dotTex: Texture, rng: Rng) {
    this.tiles = new TilingSprite({
      texture: starTex,
      width: CONFIG.width,
      height: CONFIG.height,
    });
    parent.addChild(this.tiles);

    const tints = [0xbfd8ff, 0xffffff, 0xffe9c9, 0xc9e0ff];
    for (let i = 0; i < 44; i++) {
      const s = new Sprite(dotTex);
      s.anchor.set(0.5);
      s.x = rng() * CONFIG.width;
      s.y = rng() * CONFIG.height;
      s.scale.set((1.4 + rng() * 3.2) / dotTex.width);
      s.alpha = 0.2 + rng() * 0.45;
      s.tint = pick(rng, tints);
      parent.addChild(s);
      this.twinkles.push(s);
      this.phases.push(rng() * Math.PI * 2);
    }
  }

  update(dt: number, time: number): void {
    this.tiles.tilePosition.y -= 2.2 * dt;
    for (let i = 0; i < this.twinkles.length; i++) {
      this.twinkles[i].alpha =
        0.22 + 0.42 * (0.5 + 0.5 * Math.sin(time * 1.35 + this.phases[i]));
    }
  }
}

interface DustMote {
  sp: Sprite;
  angle: number;
  speed: number;
  radius: number;
}

export class DustField {
  private motes: DustMote[] = [];

  constructor(parent: Container, dotTex: Texture, rng: Rng) {
    const tints = [0x6fb5ff, 0x8fd0ff, 0xb39dff, 0xffffff];
    for (let i = 0; i < 48; i++) {
      const sp = new Sprite(dotTex);
      sp.anchor.set(0.5);
      sp.blendMode = 'add';
      sp.tint = pick(rng, tints);
      sp.scale.set((1.6 + rng() * 3.4) / dotTex.width);
      const angle = rng() * Math.PI * 2;
      const radius = 240 + rng() * 290;
      const speed = (0.05 + rng() * 0.18) * (rng() > 0.85 ? -1 : 1);
      sp.alpha = 0.07 + rng() * 0.2;
      parent.addChild(sp);
      this.motes.push({ sp, angle, speed, radius });
    }
  }

  update(dt: number): void {
    for (const m of this.motes) {
      m.angle += m.speed * dt;
      m.sp.x = CONFIG.centerX + Math.cos(m.angle) * m.radius;
      m.sp.y = CONFIG.centerY + Math.sin(m.angle) * m.radius * CONFIG.tilt * 0.92;
    }
  }
}
