import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { CONFIG } from '../config';

export interface WarChip {
  aEmoji: string;
  aName: string;
  bEmoji: string;
  bName: string;
  duration: string;
  attackerProb: number;
}

export interface LeaderboardEntry {
  emoji: string;
  name: string;
  power: number;
  rank: number;
  delta: number;
}

export interface DebugInfo {
  fps: number;
  bodies: number;
  ticks: number;
  hostilePairs: number;
  friendlyPairs: number;
  warsActive: number;
  sinceBig: number;
  avgRelation: number;
  leaderName: string;
}

const FONT = 'Segoe UI, system-ui, Roboto, sans-serif';
const MONO = 'ui-monospace, Cascadia Mono, Menlo, monospace';
const W = CONFIG.width;
const H = CONFIG.height;

export class Compositor {
  readonly layer: Container;
  private vignetteLayer: Container;
  private hudLayer: Container;
  private topBar: Container;
  private brandText: Text;
  private liveBadge: Container;
  private liveDot: Graphics = new Graphics();
  private warsContainer: Container;
  private mysteryContainer: Container;
  private mysteryText: Text;
  private mysteryCountdown: Text;
  private announceContainer: Container;
  private announceMain: Text;
  private announceSub: Text;
  private headlineText: Text;
  private debugContainer: Container;
  private debugTexts: Text[] = [];
  private dayText: Text;
  private fictionalText: Text;
  private flashOverlay: Graphics;
  private flashTimer = 0;
  private flashDuration = 0;
  private tensionBar: Graphics;
  private tensionLevel = 0;
  private leaderboardContainer: Container;
  private leaderboardTimer = 0;
  private breakingContainer: Container;
  private breakingText: Text;
  private breakingTimer = 0;
  private hookContainer: Container;
  private hookText: Text;
  private hookTimer = 0;
  private visible = true;
  private debugVisible = false;

  private announceTimer = 0;
  private headlineTimer = 0;
  private headlineAlpha = 0;
  private mysteryPulse = 0;
  private livePulse = 0;

  constructor(stage: Container) {
    this.layer = new Container();
    this.vignetteLayer = new Container();
    this.hudLayer = new Container();
    this.topBar = new Container();
    this.warsContainer = new Container();
    this.mysteryContainer = new Container();
    this.announceContainer = new Container();
    this.debugContainer = new Container();
    this.flashOverlay = new Graphics();
    this.tensionBar = new Graphics();
    this.leaderboardContainer = new Container();
    this.breakingContainer = new Container();
    this.hookContainer = new Container();

    this.layer.addChild(this.vignetteLayer, this.hudLayer);
    this.hudLayer.addChild(
      this.topBar,
      this.warsContainer,
      this.mysteryContainer,
      this.announceContainer,
      this.debugContainer,
      this.flashOverlay,
      this.tensionBar,
      this.leaderboardContainer,
      this.breakingContainer,
      this.hookContainer,
    );
    // Hide Pixi HUD in browser — DOM Hud (src/render/hud.ts) is the live overlay.
    // Pixi HUD remains for offscreen/stream compositing; toggle via compositor.hudLayer.visible if needed.
    this.hudLayer.visible = false;

    this.drawVignette();

    this.brandText = new Text({
      text: '🌍 WORLD ORBIT',
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 30,
        fontWeight: '700',
        fill: 0xdbe7ff,
        letterSpacing: 9,
      }),
    });
    this.brandText.anchor.set(0.5, 0);
    this.brandText.x = W / 2 - 30;
    this.brandText.y = 30;
    this.topBar.addChild(this.brandText);

    this.liveBadge = this.createLiveBadge();
    this.liveBadge.x = W / 2 + 120;
    this.liveBadge.y = 36;
    this.topBar.addChild(this.liveBadge);

    this.warsContainer.y = 96;

    this.mysteryContainer.y = 170;
    this.mysteryContainer.visible = false;
    this.mysteryText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 17,
        fontWeight: '600',
        fill: 0xd9ccff,
        letterSpacing: 3,
      }),
    });
    this.mysteryCountdown = new Text({
      text: '00:00',
      style: new TextStyle({
        fontFamily: MONO,
        fontSize: 19,
        fontWeight: '700',
        fill: 0xb79aff,
        letterSpacing: 3,
      }),
    });
    this.mysteryContainer.addChild(this.mysteryText, this.mysteryCountdown);

    this.announceContainer.y = H * 0.34;
    this.announceContainer.visible = false;
    this.announceMain = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 64,
        fontWeight: '800',
        fill: 0xffffff,
        letterSpacing: 7,
      }),
    });
    this.announceMain.anchor.set(0.5);
    this.announceSub = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 24,
        fontWeight: '600',
        fill: 0xffd9d0,
        letterSpacing: 5,
      }),
    });
    this.announceSub.anchor.set(0.5);
    this.announceSub.y = 48;
    this.announceContainer.addChild(this.announceMain, this.announceSub);

    this.headlineText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 19,
        fontWeight: '600',
        fill: 0x8fe6ac,
        letterSpacing: 3,
      }),
    });
    this.headlineText.anchor.set(0.5);
    this.headlineText.x = W / 2;
    this.headlineText.y = H - 108;
    this.headlineText.alpha = 0;

    this.dayText = new Text({
      text: 'WORLD DAY 001',
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 21,
        fill: 0xbed4ff,
        letterSpacing: 6,
      }),
    });
    this.dayText.alpha = 0.85;
    this.dayText.x = 34;
    this.dayText.y = H - 40;

    this.fictionalText = new Text({
      text: 'FICTIONAL SIMULATION',
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 12,
        fill: 0x96afd7,
        letterSpacing: 4,
      }),
    });
    this.fictionalText.alpha = 0.5;
    this.fictionalText.anchor.set(1, 0);
    this.fictionalText.x = W - 34;
    this.fictionalText.y = H - 32;

    this.breakingContainer.y = 76;
    this.breakingContainer.visible = false;
    this.breakingText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 18,
        fontWeight: '700',
        fill: 0xff4444,
        letterSpacing: 4,
      }),
    });
    this.breakingText.anchor.set(0.5);
    this.breakingText.x = W / 2;
    this.breakingContainer.addChild(this.breakingText);

    this.hookContainer.y = H * 0.42;
    this.hookContainer.visible = false;
    this.hookText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 22,
        fontWeight: '600',
        fill: 0xb79aff,
        letterSpacing: 3,
      }),
    });
    this.hookText.anchor.set(0.5);
    this.hookText.x = W / 2;
    this.hookContainer.addChild(this.hookText);

    this.tensionBar.y = 72;
    this.leaderboardContainer.x = W - 220;
    this.leaderboardContainer.y = H - 220;

    this.debugContainer.x = 26;
    this.debugContainer.y = H - 280;
    this.debugContainer.visible = false;

    stage.addChild(this.layer);
  }

  setDay(day: number): void {
    this.dayText.text = `WORLD DAY ${String(day).padStart(3, '0')}`;
  }

  showAnnounce(main: string, sub: string): void {
    this.announceMain.text = main;
    this.announceSub.text = sub;
    this.announceContainer.visible = true;
    this.announceContainer.alpha = 0;
    this.announceContainer.scale.set(0.82);
    this.announceTimer = 0;
  }

  setWars(chips: WarChip[]): void {
    this.warsContainer.removeChildren();
    for (let i = 0; i < chips.length; i++) {
      const c = chips[i];
      const chip = new Container();
      chip.y = i * 38;

      const bg = new Graphics()
        .roundRect(0, 0, 620, 32, 16)
        .fill({ color: 0x2e070c, alpha: 0.62 })
        .roundRect(0, 0, 620, 32, 16)
        .stroke({ width: 1, color: 0xff5454, alpha: 0.45 });
      chip.addChild(bg);

      const vs = new Text({
        text: `${c.aEmoji} ${c.aName} ⚔️ ${c.bEmoji} ${c.bName}`,
        style: new TextStyle({
          fontFamily: FONT,
          fontSize: 17,
          fontWeight: '700',
          fill: 0xffd9d0,
          letterSpacing: 2,
        }),
      });
      vs.x = 18;
      vs.y = 6;
      chip.addChild(vs);

      const prob = Math.round(c.attackerProb * 100);
      const meta = new Text({
        text: `${c.duration} · ${prob}%`,
        style: new TextStyle({
          fontFamily: FONT,
          fontSize: 13,
          fill: 0xffbeb4,
          letterSpacing: 3,
        }),
      });
      meta.alpha = 0.85;
      meta.x = 18;
      meta.y = 18;
      chip.addChild(meta);

      this.warsContainer.addChild(chip);
    }
  }

  setHeadline(text: string, delta: number): void {
    this.headlineText.text = text;
    this.headlineText.style.fill = delta >= 0 ? 0x8fe6ac : 0xff9d8d;
    this.headlineText.alpha = 0;
    this.headlineText.y = H - 100;
    this.headlineTimer = 0;
  }

  setMystery(text: string | null, remainSec: number): void {
    if (text === null) {
      this.mysteryContainer.visible = false;
      return;
    }
    this.mysteryContainer.visible = true;
    this.mysteryText.text = text;
    const mm = String(Math.floor(remainSec / 60)).padStart(2, '0');
    const ss = String(Math.floor(remainSec % 60)).padStart(2, '0');
    this.mysteryCountdown.text = `${mm}:${ss}`;
  }

  flashScreen(color: number, intensity: number, durationSec: number): void {
    this.flashOverlay.clear();
    this.flashOverlay.rect(0, 0, W, H).fill({ color, alpha: intensity * 0.4 });
    this.flashTimer = 0;
    this.flashDuration = durationSec;
    this.flashOverlay.alpha = 1;
  }

  setGlobalTension(tension: number): void {
    this.tensionLevel = tension;
    this.tensionBar.clear();
    const barW = 180;
    const barH = 4;
    const x = 34;
    const y = 0;
    this.tensionBar.roundRect(x, y, barW, barH, 2).fill({ color: 0x1a1a2e, alpha: 0.5 });
    const fill = tension / 100;
    const color = fill < 0.3 ? 0x4ade80 : fill < 0.6 ? 0xfbbf24 : fill < 0.8 ? 0xf97316 : 0xef4444;
    this.tensionBar.roundRect(x, y, barW * fill, barH, 2).fill({ color, alpha: 0.85 });
  }

  setLeaderboard(entries: LeaderboardEntry[]): void {
    this.leaderboardContainer.removeChildren();
    const bg = new Graphics()
      .roundRect(0, 0, 200, entries.length * 28 + 30, 10)
      .fill({ color: 0x0a0f1a, alpha: 0.55 })
      .roundRect(0, 0, 200, entries.length * 28 + 30, 10)
      .stroke({ width: 1, color: 0x4a6fa5, alpha: 0.25 });
    this.leaderboardContainer.addChild(bg);

    const title = new Text({
      text: 'POWER RANK',
      style: new TextStyle({ fontFamily: FONT, fontSize: 12, fontWeight: '700', fill: 0x7a9cc6, letterSpacing: 4 }),
    });
    title.x = 14;
    title.y = 6;
    this.leaderboardContainer.addChild(title);

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const yOff = 24 + i * 28;
      const rank = new Text({
        text: `${e.rank}`,
        style: new TextStyle({ fontFamily: MONO, fontSize: 14, fontWeight: '700', fill: i === 0 ? 0xffd700 : 0x8899bb }),
      });
      rank.x = 14;
      rank.y = yOff;
      this.leaderboardContainer.addChild(rank);

      const name = new Text({
        text: `${e.emoji} ${e.name}`,
        style: new TextStyle({ fontFamily: FONT, fontSize: 14, fontWeight: '600', fill: 0xd0ddf0 }),
      });
      name.x = 38;
      name.y = yOff;
      this.leaderboardContainer.addChild(name);

      const pwr = new Text({
        text: `${e.power.toFixed(0)}`,
        style: new TextStyle({ fontFamily: MONO, fontSize: 13, fill: 0x8899bb }),
      });
      pwr.x = 155;
      pwr.y = yOff;
      this.leaderboardContainer.addChild(pwr);

      if (e.delta !== 0) {
        const arrow = new Text({
          text: e.delta > 0 ? '▲' : '▼',
          style: new TextStyle({ fontFamily: MONO, fontSize: 11, fill: e.delta > 0 ? 0x4ade80 : 0xef4444 }),
        });
        arrow.x = 185;
        arrow.y = yOff + 1;
        this.leaderboardContainer.addChild(arrow);
      }
    }
  }

  showBreaking(text: string): void {
    this.breakingText.text = `🔴 ${text}`;
    this.breakingContainer.visible = true;
    this.breakingTimer = 0;
  }

  showHook(text: string): void {
    this.hookText.text = text;
    this.hookContainer.visible = true;
    this.hookTimer = 0;
  }

  hideHook(): void {
    this.hookContainer.visible = false;
  }

  setDebug(info: DebugInfo): void {
    const lines = [
      `FPS    ${info.fps.toFixed(0)}`,
      `BODIES ${info.bodies}`,
      `TICK   ${info.ticks}`,
      `PAIRS  ${info.hostilePairs}H/${info.friendlyPairs}F`,
      `WARS   ${info.warsActive}`,
      `BORE   ${info.sinceBig.toFixed(0)}s`,
      `TOP    ${info.leaderName}`,
    ];
    this.debugContainer.removeChildren();
    const bg = new Graphics()
      .roundRect(0, 0, 216, lines.length * 26 + 24, 12)
      .fill({ color: 0x040914, alpha: 0.62 })
      .roundRect(0, 0, 216, lines.length * 26 + 24, 12)
      .stroke({ width: 1, color: 0x78b4ff, alpha: 0.22 });
    this.debugContainer.addChild(bg);

    for (let i = 0; i < lines.length; i++) {
      const t = new Text({
        text: lines[i],
        style: new TextStyle({
          fontFamily: MONO,
          fontSize: 15,
          fill: 0x9fd0ff,
          letterSpacing: 2,
          lineHeight: 26,
        }),
      });
      t.x = 16;
      t.y = 12 + i * 26;
      this.debugContainer.addChild(t);
    }
  }

  toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
    this.debugContainer.visible = this.debugVisible;
  }

  toggleHud(): void {
    this.visible = !this.visible;
    this.hudLayer.visible = this.visible;
  }

  update(dt: number): void {
    this.livePulse += dt * 2.2;
    const dotAlpha = 0.5 + 0.5 * Math.sin(this.livePulse);
    this.liveDot.alpha = dotAlpha;

    this.mysteryPulse += dt * 2.5;
    if (this.mysteryContainer.visible) {
      this.mysteryText.alpha = 0.7 + 0.3 * Math.sin(this.mysteryPulse);
    }

    if (this.announceContainer.visible) {
      this.announceTimer += dt;
      const t = this.announceTimer / 6;
      if (t < 0.06) {
        this.announceContainer.alpha = t / 0.06;
        this.announceContainer.scale.set(0.82 + 0.22 * (t / 0.06));
      } else if (t < 0.1) {
        this.announceContainer.alpha = 1;
        this.announceContainer.scale.set(1.04 - 0.04 * ((t - 0.06) / 0.04));
      } else if (t < 0.8) {
        this.announceContainer.alpha = 1;
        this.announceContainer.scale.set(1);
      } else if (t < 1) {
        this.announceContainer.alpha = 1 - (t - 0.8) / 0.2;
      } else {
        this.announceContainer.visible = false;
      }
    }

    if (this.headlineText.text) {
      this.headlineTimer += dt;
      const t = this.headlineTimer / 7;
      if (t < 0.07) {
        this.headlineAlpha = t / 0.07;
        this.headlineText.y = H - 108 + 8 * (1 - t / 0.07);
      } else if (t < 0.78) {
        this.headlineAlpha = 1;
      } else if (t < 1) {
        this.headlineAlpha = 1 - (t - 0.78) / 0.22;
      } else {
        this.headlineAlpha = 0;
      }
      this.headlineText.alpha = this.headlineAlpha;
    }

    if (this.flashOverlay.alpha > 0) {
      this.flashTimer += dt;
      const t = this.flashTimer / this.flashDuration;
      if (t < 0.15) {
        this.flashOverlay.alpha = 1 - t / 0.15;
      } else if (t < 0.5) {
        this.flashOverlay.alpha = 0;
      } else if (t < 0.65) {
        this.flashOverlay.alpha = (t - 0.5) / 0.15 * 0.3;
      } else {
        this.flashOverlay.alpha = 0;
      }
    }

    if (this.breakingContainer.visible) {
      this.breakingTimer += dt;
      const t = this.breakingTimer;
      if (t < 0.3) {
        this.breakingContainer.alpha = t / 0.3;
      } else if (t < 5) {
        this.breakingContainer.alpha = 1;
      } else if (t < 5.5) {
        this.breakingContainer.alpha = 1 - (t - 5) / 0.5;
      } else {
        this.breakingContainer.visible = false;
      }
    }

    if (this.hookContainer.visible) {
      this.hookTimer += dt;
      const pulse = 0.6 + 0.4 * Math.sin(this.hookTimer * 1.5);
      this.hookText.alpha = pulse;
      if (this.hookTimer > 6) {
        this.hookContainer.visible = false;
      }
    }
  }

  private createLiveBadge(): Container {
    const badge = new Container();

    const bg = new Graphics()
      .roundRect(0, 0, 100, 30, 15)
      .fill({ color: 0x1e060a, alpha: 0.45 })
      .roundRect(0, 0, 100, 30, 15)
      .stroke({ width: 1, color: 0xff5a5a, alpha: 0.42 });
    badge.addChild(bg);

    this.liveDot = new Graphics().circle(0, 0, 5.5).fill(0xff4d4d);
    this.liveDot.x = 22;
    this.liveDot.y = 15;
    badge.addChild(this.liveDot);

    const label = new Text({
      text: 'LIVE',
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 16,
        fontWeight: '600',
        fill: 0xffb4b4,
        letterSpacing: 7,
      }),
    });
    label.x = 35;
    label.y = 5;
    badge.addChild(label);

    return badge;
  }

  private drawVignette(): void {
    const g = new Graphics();
    const cx = W / 2;
    const cy = H / 2;
    const steps = 12;
    for (let i = steps; i >= 0; i--) {
      const f = i / steps;
      const rx = 82 + (1 - f) * 40;
      const ry = 68 + (1 - f) * 40;
      const alpha = f * 0.62;
      g.ellipse(cx, cy, W * rx / 200, H * ry / 200).fill({ color: 0x01030a, alpha });
    }
    this.vignetteLayer.addChild(g);
  }
}
