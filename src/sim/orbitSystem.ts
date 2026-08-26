import { CONFIG } from '../config';
import type { Rng } from '../core/rng';
import type { CountryDef, OrbitBody } from './types';
import { STATE_SPEED_MUL } from './types';

const TWO_PI = Math.PI * 2;

function wrapAngle(a: number): number {
  a %= TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  if (a < -Math.PI) a += TWO_PI;
  return a;
}

function radialImpulse(b: OrbitBody, nx: number, ny: number, amount: number): void {
  const rx = Math.cos(b.angle);
  const ry = Math.sin(b.angle) * CONFIG.tilt;
  const len = Math.hypot(rx, ry) || 1;
  b.radialVel += ((nx * rx + ny * ry) / len) * amount;
}

export function createBodies(defs: CountryDef[], rng: Rng): OrbitBody[] {
  const bodies: OrbitBody[] = [];
  for (let tier = 0; tier < CONFIG.rings.length; tier++) {
    const list = defs.filter((d) => d.tier === tier);
    list.forEach((def, i) => {
      const ring = CONFIG.rings[tier];
      const angle = (i / list.length) * TWO_PI + rng() * 0.9;
      const radius = ring.radius + (rng() - 0.5) * 18;
      bodies.push({
        def,
        ring: tier,
        startTier: tier,
        tierTarget: tier,
        sizeRatio: 1,
        state: 'normal',
        angle,
        dir: 1,
        omega: ring.speed,
        baseRadius: radius,
        radius,
        radialVel: 0,
        bobPhase: rng() * TWO_PI,
        bobFreq: 0.3 + rng() * 0.45,
        bobAmp:
          CONFIG.physics.bobAmpMin +
          rng() * (CONFIG.physics.bobAmpMax - CONFIG.physics.bobAmpMin),
        driftF: [0.05 + rng() * 0.07, 0.11 + rng() * 0.13],
        driftP: [rng() * TWO_PI, rng() * TWO_PI],
        wanderF: [0.03 + rng() * 0.04, 0.07 + rng() * 0.06],
        wanderP: [rng() * TWO_PI, rng() * TWO_PI],
        x: 0,
        y: 0,
        depth: 0,
        scale: 1,
      });
    });
  }
  refreshTransforms(bodies);
  return bodies;
}

function interact(a: OrbitBody, b: OrbitBody, dt: number): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;

  if (a.tierTarget === b.tierTarget) {
    const dAng = wrapAngle(b.angle - a.angle);
    const sep = CONFIG.physics.sameRingSepAngle;
    if (Math.abs(dAng) < sep) {
      const push = ((sep - Math.abs(dAng)) / sep) * CONFIG.physics.sameRingPush;
      const s = dAng >= 0 ? 1 : -1;
      a.omega -= s * push * dt;
      b.omega += s * push * dt;
      const rdir = a.radius <= b.radius ? 1 : -1;
      a.radialVel -= rdir * push * 34 * dt;
      b.radialVel += rdir * push * 34 * dt;
    }
    return;
  }

  if (dist < CONFIG.physics.screenRepulseDist) {
    const overlap = (CONFIG.physics.screenRepulseDist - dist) / CONFIG.physics.screenRepulseDist;
    const nx = dx / dist;
    const ny = dy / dist;
    const imp = overlap * CONFIG.physics.crossPush * dt;
    radialImpulse(a, -nx, -ny, imp);
    radialImpulse(b, nx, ny, imp);
  }
}

function warPull(a: OrbitBody, b: OrbitBody, dt: number): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  const imp = CONFIG.physics.warPull * dt;
  radialImpulse(a, nx, ny, imp);
  radialImpulse(b, -nx, -ny, imp);

  const dAng = wrapAngle(b.angle - a.angle);
  const closing = Math.sign(-dAng) * Math.min(Math.abs(dAng), 0.5);
  a.omega += closing * 0.05 * dt;
  b.omega -= closing * 0.05 * dt;
}

export function stepOrbits(
  bodies: OrbitBody[],
  dt: number,
  t: number,
  warPairs: Array<[number, number]> = [],
): void {
  for (const b of bodies) {
    const targetRingIdx = b.tierTarget;
    const ring = CONFIG.rings[targetRingIdx];

    const jit =
      Math.sin(t * b.driftF[0] + b.driftP[0]) * 0.09 +
      Math.sin(t * b.driftF[1] + b.driftP[1]) * 0.05;
    const targetOmega = ring.speed * b.dir * (1 + jit) * STATE_SPEED_MUL[b.state];
    const maxAccel = 0.12 * dt;
    b.omega += Math.max(-maxAccel, Math.min(maxAccel, targetOmega - b.omega));

    const glide = Math.min(1, dt * 0.12);
    b.baseRadius += (ring.radius - b.baseRadius) * glide;

    const ratioTarget =
      CONFIG.flagWidths[b.tierTarget] / CONFIG.flagWidths[b.startTier];
    b.sizeRatio += (ratioTarget - b.sizeRatio) * Math.min(1, dt * 0.08);

    const wander =
      CONFIG.physics.radiusWander *
      (Math.sin(t * b.wanderF[0] + b.wanderP[0]) * 0.7 +
        Math.sin(t * b.wanderF[1] + b.wanderP[1]) * 0.3);
    b.radialVel +=
      (-ring.bounceK * (b.radius - b.baseRadius - wander) -
        CONFIG.physics.radialDamping * b.radialVel) *
      dt;
  }

  const n = bodies.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) interact(bodies[i], bodies[j], dt);
  }
  for (const [i, j] of warPairs) warPull(bodies[i], bodies[j], dt);

  for (const b of bodies) {
    b.angle = wrapAngle(b.angle + b.omega * dt);
    b.radius += b.radialVel * dt;
    const dev = b.radius - b.baseRadius;
    if (dev > CONFIG.physics.maxRadiusDeviation) {
      b.radius = b.baseRadius + CONFIG.physics.maxRadiusDeviation;
      if (b.radialVel > 0) b.radialVel = 0;
    } else if (dev < -CONFIG.physics.maxRadiusDeviation) {
      b.radius = b.baseRadius - CONFIG.physics.maxRadiusDeviation;
      if (b.radialVel < 0) b.radialVel = 0;
    }
  }

  refreshTransforms(bodies);
}

export function refreshTransforms(bodies: OrbitBody[]): void {
  for (const b of bodies) {
    b.depth = Math.sin(b.angle);
    b.x = CONFIG.centerX + Math.cos(b.angle) * b.radius;
    b.y = CONFIG.centerY + b.depth * b.radius * CONFIG.tilt;
    b.scale = 0.78 + ((b.depth + 1) / 2) * 0.44;
  }
}
