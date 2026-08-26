/**
 * Central orbit visualization — synchronized to simulation clock.
 * Single authoritative time source: WorldState.time (driven by main ticker).
 * No internal requestAnimationFrame; main loop calls update().
 * Fallback to CSS if 2D context unavailable. Respects prefers-reduced-motion.
 */

export interface OrbitCenterOptions {
  /** Simulation time in seconds (WorldState.time) */
  getTime: () => number;
  /** Whether simulation is paused — freezes animation */
  isPaused: () => boolean;
}

export interface OrbitCenterHandle {
  destroy(): void;
  /** Called from main ticker with authoritative sim time */
  update(simTime: number): void;
}

export function createOrbitCenter(
  mount: HTMLElement,
  opts: OrbitCenterOptions,
): OrbitCenterHandle {
  const container = document.createElement('div');
  container.id = 'orbit-center';
  container.setAttribute('aria-hidden', 'true');
  container.style.cssText = `
    position:absolute;
    left:50%;top:50%;
    transform:translate(-50%,-50%) scale(0.5);
    transform-origin:center center;
    width:min(76vw, 640px);
    height:min(76vw, 640px);
    max-width:640px;max-height:640px;
    aspect-ratio:1;
    pointer-events:none;
    z-index:1;
    display:grid;place-items:center;
  `;

  // Insert behind HUD (so HUD stays interactive and on top)
  const hudEl = mount.querySelector('.hud');
  if (hudEl) mount.insertBefore(container, hudEl);
  else mount.appendChild(container);

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'World orbit simulation');
  canvas.style.cssText = 'width:100%;height:100%;display:block;';
  container.appendChild(canvas);

  const _ctx = canvas.getContext('2d');
  if (!_ctx) {
    container.innerHTML = `<div style="width:42%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 32% 28%,#6ec6ff 0%,#2a6fd4 32%,#0d2a5e 68%,#05122b 100%);box-shadow:0 0 60px rgba(43,140,255,0.55), inset 0 0 40px rgba(255,255,255,0.15);border:2px solid rgba(122,184,255,0.35);"></div>`;
    return {
      destroy: () => container.remove(),
      update: () => {},
    };
  }
  const ctx = _ctx;

  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  let prefersReduced = mql.matches;
  const onMql = (e: MediaQueryListEvent) => (prefersReduced = e.matches);
  // Safari <14 uses addListener
  if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onMql);
  else (mql as unknown as { addListener: (cb: (e: MediaQueryListEvent) => void) => void }).addListener(onMql);

  let w = 0,
    h = 0,
    dpr = 1;

  type Star = { x: number; y: number; r: number; a: number; tw: number; phase: number };
  let stars: Star[] = [];
  const satellites = [
    { r: 0.31, speed: 0.42, phase: 0, size: 3.5, color: '#7ab8ff' },
    { r: 0.41, speed: -0.28, phase: 1.1, size: 2.8, color: '#ffd27a' },
    { r: 0.48, speed: 0.19, phase: 2.4, size: 2.2, color: '#7affc6' },
    { r: 0.36, speed: 0.55, phase: 4.2, size: 2.0, color: '#ff7ab8' },
  ];

  function resize() {
    const rect = container.getBoundingClientRect();
    w = Math.max(1, Math.floor(rect.width));
    h = Math.max(1, Math.floor(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.floor((w * h) / 4200);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.1 + 0.2,
      a: Math.random() * 0.55 + 0.15,
      tw: Math.random() * 0.8 + 0.2,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // Pause rendering when tab hidden to save GPU
  let hidden = document.hidden;
  const onVis = () => {
    hidden = document.hidden;
  };
  document.addEventListener('visibilitychange', onVis);

  function drawEarth(cx: number, cy: number, R: number, time: number) {
    const glow = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.55);
    glow.addColorStop(0, 'rgba(43,140,255,0.28)');
    glow.addColorStop(0.5, 'rgba(43,140,255,0.12)');
    glow.addColorStop(1, 'rgba(43,140,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    const g = ctx.createLinearGradient(cx - R, cy, cx + R, cy);
    g.addColorStop(0, '#0a2a5e');
    g.addColorStop(0.5, '#143a7a');
    g.addColorStop(1, '#0f2f63');
    ctx.fillStyle = g;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.fillStyle = '#2e6a3a';
    const rot = (time * 0.07) % (Math.PI * 2);
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + rot;
      const rx = R * 0.38,
        ry = R * 0.22;
      const x = cx + Math.cos(ang) * R * 0.42;
      const y = cy + Math.sin(ang) * R * 0.18;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang * 0.3);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const hl = ctx.createRadialGradient(cx - R * 0.32, cy - R * 0.35, R * 0.1, cx - R * 0.32, cy - R * 0.35, R * 0.9);
    hl.addColorStop(0, 'rgba(255,255,255,0.22)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    for (let i = 0; i < 4; i++) {
      const y = cy - R * 0.6 + i * R * 0.4 + Math.sin(time * 0.15 + i) * 4;
      const xoff = (time * 6 + i * 90) % (R * 2);
      ctx.fillRect(cx - R + xoff, y, R * 0.55, 3);
      ctx.fillRect(cx - R + xoff - R * 2, y, R * 0.55, 3);
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(122,184,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(2,8,24,0.55)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, R - 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  function render(simTime: number) {
    // Reset transform every frame to prevent accumulation (DPR safe) and ensure clean clear
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2,
      cy = h / 2;
    const R = Math.min(w, h) * 0.21;

    // stars twinkle driven by simTime
    for (const s of stars) {
      const tw = prefersReduced ? 1 : 0.7 + 0.3 * Math.sin(simTime * s.tw + s.phase);
      ctx.fillStyle = `rgba(255,255,255,${s.a * tw})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    const rings = [R * 1.42, R * 1.82, R * 2.18];
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      const alpha = 0.045 - i * 0.008;
      ctx.strokeStyle = `rgba(154,196,255,${alpha + 0.03})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (!prefersReduced && !opts.isPaused()) {
        ctx.save();
        ctx.setLineDash([6, 14]);
        ctx.lineDashOffset = -simTime * (8 + i * 4);
        ctx.strokeStyle = `rgba(154,196,255,${alpha})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();

    drawEarth(cx, cy, R, simTime);

    for (const s of satellites) {
      const ang = simTime * s.speed + s.phase;
      const orbitR = R * (1.38 + s.r);
      const x = cx + Math.cos(ang) * orbitR;
      const y = cy + Math.sin(ang) * orbitR * 0.42;
      const depth = (Math.sin(ang) + 1) / 2;
      const alpha = 0.45 + depth * 0.55;
      const scale = 0.75 + depth * 0.5;
      ctx.fillStyle = s.color + Math.round(alpha * 255).toString(16).padStart(2, '0');
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, s.size * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 6 * scale;
      ctx.beginPath();
      ctx.arc(x, y, s.size * 0.6 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    if (!prefersReduced && !opts.isPaused()) {
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      for (let i = 0; i < 14; i++) {
        const px = (cx + Math.cos(simTime * 0.08 + i) * (R * 1.9 + i * 3)) % w;
        const py = (cy + Math.sin(simTime * 0.07 + i * 1.3) * R * 0.9 + i * 18) % h;
        ctx.beginPath();
        ctx.arc(px, py, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const vig = ctx.createRadialGradient(cx, cy, R * 1.6, cx, cy, Math.max(w, h) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(1,3,10,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  // Initial draw with current sim time
  render(opts.getTime());

  return {
    update(simTime: number) {
      render(simTime);
    },
    destroy() {
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', onMql);
      else (mql as unknown as { removeListener: (cb: (e: MediaQueryListEvent) => void) => void }).removeListener(onMql);
      container.remove();
    },
  };
}
