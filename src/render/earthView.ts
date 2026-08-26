import { Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import { CONFIG } from '../config';

export class EarthView {
  readonly view: Container;
  private surf: TilingSprite;
  private clouds: TilingSprite;
  private halo: Sprite;
  private pulse: Sprite;
  private r: number;

  constructor(
    parent: Container,
    surface: Texture,
    clouds: Texture,
    shade: Texture,
    rim: Texture,
    glow: Texture,
  ) {
    this.r = CONFIG.earth.radius;
    this.view = new Container();
    this.view.position.set(CONFIG.centerX, CONFIG.centerY);
    this.view.zIndex = 0;

    this.halo = new Sprite(glow);
    this.halo.anchor.set(0.5);
    this.halo.scale.set((this.r * 3.2) / glow.width);
    this.halo.alpha = 0.7;
    this.halo.tint = 0x4d8dff;
    this.halo.blendMode = 'add';

    const core = new Container();
    core.addChild(new Graphics().circle(0, 0, this.r).fill(0x0d3a70));

    this.surf = new TilingSprite({
      texture: surface,
      width: this.r * 2,
      height: this.r * 2,
    });
    this.surf.position.set(-this.r, -this.r);

    this.clouds = new TilingSprite({
      texture: clouds,
      width: this.r * 2,
      height: this.r * 2,
    });
    this.clouds.position.set(-this.r, -this.r);
    this.clouds.alpha = 0.5;

    const mask = new Graphics().circle(0, 0, this.r).fill(0xffffff);
    core.addChild(this.surf, this.clouds, mask);
    core.mask = mask;

    const shadeSpr = new Sprite(shade);
    shadeSpr.anchor.set(0.5);
    shadeSpr.scale.set((this.r * 2.02) / shade.width);

    const rimSpr = new Sprite(rim);
    rimSpr.anchor.set(0.5);
    rimSpr.scale.set((this.r * 2.14) / rim.width);
    rimSpr.blendMode = 'add';
    rimSpr.alpha = 0.95;

    this.pulse = new Sprite(rim);
    this.pulse.anchor.set(0.5);
    this.pulse.blendMode = 'add';
    this.pulse.alpha = 0;

    this.view.addChild(this.halo, core, shadeSpr, rimSpr, this.pulse);
    parent.addChild(this.view);
  }

  update(dt: number, time: number): void {
    this.surf.tilePosition.x -= CONFIG.earth.rotationSpeed * dt;
    this.clouds.tilePosition.x -= CONFIG.earth.cloudSpeed * dt;

    this.halo.alpha = 0.62 + 0.12 * Math.sin(time * 0.23);
    this.halo.scale.set(
      ((this.r * 3.2) / this.halo.texture.width) * (1 + 0.02 * Math.sin(time * 0.31)),
    );
    this.view.y = CONFIG.centerY + Math.sin(time * 0.11) * 6;

    const cycle = (time % 9) / 9;
    const baseScale = (this.r * 2.14) / this.pulse.texture.width;
    this.pulse.scale.set(baseScale * (1 + cycle * 1.6));
    this.pulse.alpha = Math.pow(1 - cycle, 2) * 0.26;
  }
}
