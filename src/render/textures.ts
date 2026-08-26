import { Texture } from 'pixi.js';
import { mulberry32, range, pick, type Rng } from '../core/rng';

function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function drawWrapped(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  x: number,
  y: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): void {
  for (const ox of [-w, 0, w]) {
    for (const oy of [-h, 0, h]) {
      ctx.save();
      ctx.translate(x + ox, y + oy);
      draw(ctx);
      ctx.restore();
    }
  }
}

function ellipseBlob(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rot: number,
  fill: string,
): void {
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function makeGlowTexture(size = 128): Texture {
  const [c, ctx] = canvas2d(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.38)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.10)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(c);
}

export function makeStarTile(w: number, h: number, seed: number): Texture {
  const rng = mulberry32(seed);
  const [c, ctx] = canvas2d(w, h);

  const nebulas = [
    ['96,150,255', 0.05],
    ['168,120,255', 0.045],
    ['84,196,255', 0.04],
    ['255,150,190', 0.03],
  ] as const;
  for (const [rgb, a] of nebulas) {
    const x = rng() * w;
    const y = rng() * h;
    const r = range(rng, 300, 560);
    drawWrapped(ctx, w, h, x, y, (g) => {
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, `rgba(${rgb},${a})`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad;
      g.fillRect(-r, -r, r * 2, r * 2);
    });
  }

  for (let i = 0; i < 300; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = range(rng, 0.5, 1.9);
    const a = range(rng, 0.15, 0.85);
    const tint = pick(rng as Rng, ['255,255,255', '191,216,255', '255,233,201', '201,224,255']);
    drawWrapped(ctx, w, h, x, y, (g) => {
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fillStyle = `rgba(${tint},${a})`;
      g.fill();
    });
  }

  return Texture.from(c);
}

export function makeEarthSurface(seed: number): Texture {
  const W = 1024;
  const H = 512;
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const [c, ctx] = canvas2d(W, H);

  const ocean = ctx.createLinearGradient(0, 0, 0, H);
  ocean.addColorStop(0, '#0a2c5e');
  ocean.addColorStop(0.5, '#0f4d8f');
  ocean.addColorStop(1, '#0a2c5e');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 16; i++) {
    const x = rng() * W;
    const y = range(rng, 40, H - 40);
    const r = range(rng, 60, 190);
    drawWrapped(ctx, W, H, x, y, (g) => {
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, 'rgba(7,32,72,0.35)');
      grad.addColorStop(1, 'rgba(7,32,72,0)');
      g.fillStyle = grad;
      g.fillRect(-r, -r, r * 2, r * 2);
    });
  }

  const lands = ['#2e7d46', '#3c8a4f', '#57935a', '#7a9a52', '#a5935a', '#8a7a4a'];
  try {
    ctx.filter = 'blur(3px)';
  } catch {
    /* noop */
  }
  for (let i = 0; i < 130; i++) {
    const x = rng() * W;
    const y = range(rng, 64, H - 64);
    const rx = range(rng, 36, 150);
    const ry = range(rng, 20, 88);
    const rot = rng() * Math.PI;
    const col = pick(rng, lands);
    drawWrapped(ctx, W, H, x, y, (g) => ellipseBlob(g, rx, ry, rot, col));
  }
  const highs = ['#5aa763', '#79b06a', '#b8a86e'];
  for (let i = 0; i < 60; i++) {
    const x = rng() * W;
    const y = range(rng, 70, H - 70);
    const rx = range(rng, 14, 52);
    const ry = range(rng, 8, 30);
    const rot = rng() * Math.PI;
    drawWrapped(ctx, W, H, x, y, (g) => ellipseBlob(g, rx, ry, rot, highs[Math.floor(rng() * highs.length)]));
  }
  ctx.filter = 'none';

  for (const [y0, dir] of [[0, 1], [H, -1]] as const) {
    const cap = ctx.createLinearGradient(0, y0, 0, y0 + dir * 78);
    cap.addColorStop(0, 'rgba(228,240,250,0.95)');
    cap.addColorStop(0.55, 'rgba(214,232,245,0.55)');
    cap.addColorStop(1, 'rgba(214,232,245,0)');
    ctx.fillStyle = cap;
    ctx.fillRect(0, Math.min(y0, y0 + dir * 78), W, 78);
  }

  for (let i = 0; i < 1200; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const a = range(rng, 0.02, 0.07);
    ctx.fillStyle = rng() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,10,30,${a})`;
    ctx.fillRect(x, y, range(rng, 1, 3), range(rng, 1, 3));
  }

  return Texture.from(c);
}

export function makeCloudSurface(seed: number): Texture {
  const W = 1024;
  const H = 512;
  const rng = mulberry32(seed ^ 0x51ab3f);
  const [c, ctx] = canvas2d(W, H);
  try {
    ctx.filter = 'blur(7px)';
  } catch {
    /* noop */
  }
  for (let i = 0; i < 80; i++) {
    const x = rng() * W;
    const y = range(rng, 50, H - 50);
    const rx = range(rng, 46, 165);
    const ry = range(rng, 9, 30);
    const rot = (rng() - 0.5) * 0.5;
    const a = range(rng, 0.2, 0.5);
    drawWrapped(ctx, W, H, x, y, (g) => ellipseBlob(g, rx, ry, rot, `rgba(255,255,255,${a})`));
  }
  ctx.filter = 'none';
  return Texture.from(c);
}

export function makeSphereShadeTexture(size = 512): Texture {
  const [c, ctx] = canvas2d(size, size);

  const hl = ctx.createRadialGradient(
    size * 0.36,
    size * 0.32,
    0,
    size * 0.36,
    size * 0.32,
    size * 0.55,
  );
  hl.addColorStop(0, 'rgba(215,238,255,0.22)');
  hl.addColorStop(1, 'rgba(215,238,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(0, 0, size, size);

  const limb = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.18,
    size / 2,
    size / 2,
    size / 2,
  );
  limb.addColorStop(0, 'rgba(0,0,0,0)');
  limb.addColorStop(0.66, 'rgba(3,8,22,0)');
  limb.addColorStop(0.87, 'rgba(3,8,22,0.42)');
  limb.addColorStop(1, 'rgba(1,4,12,0.82)');
  ctx.fillStyle = limb;
  ctx.fillRect(0, 0, size, size);

  return Texture.from(c);
}

export function makeRimTexture(size = 512): Texture {
  const [c, ctx] = canvas2d(size, size);
  const half = size / 2;
  const g = ctx.createRadialGradient(half, half, half * 0.5, half, half, half);
  g.addColorStop(0, 'rgba(120,190,255,0)');
  g.addColorStop(0.72, 'rgba(130,195,255,0)');
  g.addColorStop(0.83, 'rgba(140,200,255,0.5)');
  g.addColorStop(0.93, 'rgba(90,150,255,0.16)');
  g.addColorStop(1, 'rgba(90,150,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(c);
}
