import './style.css';
import { Assets, Graphics, Texture, type Ticker } from 'pixi.js';
import { CONFIG } from './config';
import { mulberry32 } from './core/rng';
import { COUNTRIES } from './sim/countries';
import { createWorld, stepWorld } from './sim/world';
import { relationKind } from './sim/types';
import { createStage } from './render/stage';
import {
  makeCloudSurface,
  makeEarthSurface,
  makeGlowTexture,
  makeRimTexture,
  makeSphereShadeTexture,
  makeStarTile,
} from './render/textures';
import { DustField, Starfield } from './render/starfield';
import { EarthView } from './render/earthView';
import { FlagView } from './render/flagView';
import { Hud } from './render/hud';
import { Compositor } from './render/compositor';
import { Camera } from './render/camera';
import { createOrbitCenter } from './render/orbitCenter';
import { StreamOutput } from './render/stream';
import { AudioSystem } from './render/audio';
import { flagEmoji } from './sim/diplomacy';
import { getDirectorSituation } from './sim/director';
import type { EventKind, Spectacle, StoryTier } from './sim/types';
import type { LeaderboardEntry } from './render/compositor';
import { SimulationHealth, StoryQualityEngine, BoredomAnalytics, AntiRepetition, CountryBalanceMonitor, WarBalanceMonitor, EventWatchdog, StoryWatchdog, CameraWatchdog, BroadcastWatchdog } from './monitoring';
import { PredictionOverlay } from './render/predictionOverlay';
import { createStore as createPredictionStore, createPrediction, resolvePrediction, getActivePredictions } from './audience/prediction';
import { Leaderboard } from './audience/leaderboard';

const ANNOUNCE_TITLES: Partial<Record<EventKind, string>> = {
  'war-declared': '⚔️ WAR DECLARED',
  victory: '🏆 VICTORY',
  peace: '🕊 CEASEFIRE',
  'superpower-crisis': '💥 SUPERPOWER CRISIS',
  'global-tension': '🌍 WORLD ON EDGE',
  'massive-alliance': '🌐 GRAND ALLIANCE',
  betrayal: '🗡 BETRAYAL',
  transformation: '✨ TRANSFORMATION',
  'new-era': '🌅 NEW ERA',
  mystery: '❓ MYSTERY',
  'mystery-resolve': '❓ MYSTERY RESOLVED',
  'economic-crisis': '📉 ECONOMIC CRISIS',
  rebellion: '🔥 REBELLION',
  'alliance-form': '🔵 ALLIANCE FORMED',
  'leadership-change': '👤 LEADERSHIP CHANGE',
  'border-dispute': '⚠️ BORDER DISPUTE',
  'resource-discovery': '💎 RESOURCE DISCOVERY',
};

const FLASH_COLORS: Partial<Record<string, number>> = {
  'war-declared': 0xffffff,
  victory: 0xffd700,
  betrayal: 0xff4444,
  mystery: 0x9b59b6,
  'mystery-resolve': 0x9b59b6,
  'massive-alliance': 0x3498db,
  transformation: 0xf39c12,
  'new-era': 0xf1c40f,
};

const SOUND_MAP: Partial<Record<EventKind, string>> = {
  'war-declared': 'war',
  victory: 'victory',
  mystery: 'mystery',
  'mystery-resolve': 'mystery',
  battle: 'battle',
  'superpower-crisis': 'crisis',
  'economic-crisis': 'crisis',
  betrayal: 'betrayal',
  'alliance-form': 'alliance',
  'massive-alliance': 'alliance',
  rebellion: 'escalation',
  'new-era': 'resolution',
  transformation: 'resolution',
};

async function boot(): Promise<void> {
  const mount = document.getElementById('app');
  if (!mount) throw new Error('missing #app mount');

  const stage = await createStage(mount);
  const hud = new Hud(stage.wrap);
  const compositor = new Compositor(stage.app.stage);

  const glow = makeGlowTexture();
  const starTex = makeStarTile(CONFIG.width, CONFIG.height, CONFIG.seed ^ 11);
  const surface = makeEarthSurface(CONFIG.seed);
  const clouds = makeCloudSurface(CONFIG.seed ^ 77);
  const shade = makeSphereShadeTexture();
  const rim = makeRimTexture();

  const flagTextures = new Map<string, Texture>();
  await Promise.all(
    COUNTRIES.map(async (c) => {
      flagTextures.set(c.code, await Assets.load(`/flags/${c.code}.png`));
    }),
  );

  const rng = mulberry32(CONFIG.seed);
  const world = createWorld(CONFIG.seed);
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__wo = world;
  }

  const orbitCenter = createOrbitCenter(stage.wrap, {
    getTime: () => world.time,
    isPaused: () => world.paused,
  });

  const simHealth = new SimulationHealth();
  const storyQuality = new StoryQualityEngine();
  const boredomAnalytics = new BoredomAnalytics();
  const antiRepetition = new AntiRepetition();
  const countryBalance = new CountryBalanceMonitor();
  const warBalance = new WarBalanceMonitor();
  const eventWatchdog = new EventWatchdog();
  const storyWatchdog = new StoryWatchdog();
  const cameraWatchdog = new CameraWatchdog();
  const broadcastWatchdog = new BroadcastWatchdog();
  const predictionOverlay = new PredictionOverlay(stage.app.stage);
  const predictionStore = createPredictionStore();
  const citizenLeaderboard = new Leaderboard();

  const stars = new Starfield(stage.background, starTex, glow, rng);
  const dust = new DustField(stage.background, glow, rng);
  const earth = new EarthView(stage.world, surface, clouds, shade, rim, glow);

  const camera = new Camera(stage.world);
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__cam = camera;
    (window as unknown as Record<string, unknown>).__stage = stage;
  }
  const stream = new StreamOutput(stage.app);
  const audio = new AudioSystem();

  const guides = new Graphics();
  for (const ring of CONFIG.rings) {
    guides
      .ellipse(CONFIG.centerX, CONFIG.centerY, ring.radius, ring.radius * CONFIG.tilt)
      .stroke({ width: 2, color: 0x9fc4ff, alpha: 0.05 });
  }
  guides.zIndex = -10000;
  stage.world.addChild(guides);

  const views = world.bodies.map(
    (b) => new FlagView(stage.world, b, flagTextures.get(b.def.code)!, glow, rng),
  );

  let acc = 0;
  let frame = 0;
  let hudTimer = 0;
  let fpsEma = 60;
  let lastNewsId = 0;

  let lastWarCount = 0;
  let lastNewsCount = 0;

  stage.app.ticker.add((ticker: Ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.05);
    acc += dt;
    let steps = 0;
    while (acc >= CONFIG.simStep && steps < 5) {
      stepWorld(world, CONFIG.simStep);
      acc -= CONFIG.simStep;
      steps++;
    }

    const time = world.time;
    frame++;

    camera.update(dt, world);

    stars.update(dt, time);
    dust.update(dt);
    earth.update(dt, time);
    orbitCenter.update(time);

    const sample = frame % CONFIG.physics.trailSampleEvery === 0;
    for (let i = 0; i < views.length; i++) {
      if (sample) views[i].pushTrailPoint(world.bodies[i].x, world.bodies[i].y);
      views[i].sync(world.bodies[i], time);
    }

    hudTimer += dt;
    fpsEma = fpsEma * 0.95 + ticker.FPS * 0.05;
    if (hudTimer > 0.25) {
      hudTimer = 0;
      hud.setDay(world.day);
      compositor.setDay(world.day);

      const latest = world.news[world.news.length - 1];
      if (latest && latest.id > lastNewsId) {
        lastNewsId = latest.id;
        hud.setHeadline(latest.headline, latest.delta);
        compositor.setHeadline(latest.headline, latest.delta);
        const title = ANNOUNCE_TITLES[latest.kind];
        if (title) {
          const A = world.byId.get(latest.actorA);
          const B = world.byId.get(latest.actorB);
          const parts = [A, B]
            .filter((c): c is NonNullable<typeof c> => !!c)
            .map((c) => `${flagEmoji(c.def.code)} ${c.def.name}`);
          hud.showAnnounce(title, parts.join(' · '));
          compositor.showAnnounce(title, parts.join(' · '));

          const spec = latest.spectacle;
          const intensity = spec?.intensity ?? 0.3;
          const tier = spec?.tier ?? 'common';

          if (tier === 'rare' || tier === 'legendary') {
            compositor.showBreaking(title);
          }

          if (spec?.visual === 'flash') {
            const color = FLASH_COLORS[latest.kind] ?? 0xffffff;
            const dur = tier === 'legendary' ? 1.2 : tier === 'rare' ? 0.8 : 0.5;
            compositor.flashScreen(color, intensity, dur);
          }

          const soundKind = SOUND_MAP[latest.kind];
          if (soundKind) {
            audio.play(soundKind as never, intensity);
          }

          const aBody = A ? world.bodies.find((b) => b.def.id === A.def.id) : null;
          const bBody = B ? world.bodies.find((b) => b.def.id === B.def.id) : null;

          if (latest.kind === 'war-declared' || latest.kind === 'victory' || latest.kind === 'mystery') {
            camera.focusEvent(4, aBody?.x, aBody?.y, spec?.tier === 'legendary' ? 2.0 : 1.6);
            camera.shake(intensity * 10);
          } else if (latest.kind === 'battle') {
            camera.shake(intensity * 6);
          } else if (aBody && bBody) {
            const mx = (aBody.x + bBody.x) / 2;
            const my = (aBody.y + bBody.y) / 2;
            camera.dramaticZoom(mx, my, 1.3 + intensity * 0.5, 2);
          } else if (A) {
            camera.focusCountry(A.def.id, 3, world);
          }
        }
      }

      const chips = [];
      let warCount = 0;
      for (const war of world.wars.values()) {
        if (war.outcome) continue;
        warCount++;
        const A = world.byId.get(war.attackerId)!;
        const B = world.byId.get(war.defenderId)!;
        const durSec = Math.max(0, Math.round(world.time - war.startTime));
        const mm = String(Math.floor(durSec / 60)).padStart(2, '0');
        const ss = String(durSec % 60).padStart(2, '0');
        const prob = 1 / (1 + Math.exp(-war.momentum / 28));
        chips.push({
          aEmoji: flagEmoji(A.def.code),
          aName: A.def.name,
          bEmoji: flagEmoji(B.def.code),
          bName: B.def.name,
          duration: `${mm}:${ss}`,
          attackerProb: prob,
        });
      }
      if (warCount > lastWarCount) {
        for (const war of world.wars.values()) {
          if (!war.outcome) { camera.focusWar(war.id); break; }
        }
        camera.shake(6);
      }
      lastWarCount = warCount;
      hud.setWars(chips);
      compositor.setWars(chips);

      const mystery = world.story.mysteries[0];
      if (mystery && mystery.countdownEnd !== null && mystery.idx < mystery.steps.length) {
        const current = mystery.steps[mystery.idx];
        const mText = current.at <= world.time ? 'TRACKING SIGNAL...' : '❓ UNKNOWN SIGNAL';
        const mRemain = Math.max(0, mystery.countdownEnd - world.time);
        hud.setMystery(mText, mRemain);
        compositor.setMystery(mText, mRemain);
      } else {
        hud.setMystery(null, 0);
        compositor.setMystery(null, 0);
      }

      let sum = 0;
      let hostile = 0;
      let friendly = 0;
      let warsActive = 0;
      for (const war of world.wars.values()) {
        if (!war.outcome) warsActive++;
      }
      for (const rel of world.relations.values()) {
        sum += rel.score;
        const kind = relationKind(rel.score);
        if (kind === 'hostile') hostile++;
        else if (kind === 'friendly') friendly++;
      }
      const leader = world.countries.reduce((a, b) => (b.power > a.power ? b : a));
      const dbg = {
        fps: fpsEma,
        bodies: world.bodies.length,
        ticks: Math.round(world.time / CONFIG.simStep),
        hostilePairs: hostile,
        friendlyPairs: friendly,
        warsActive,
        sinceBig: world.time - world.story.lastBigMoment,
        avgRelation: sum / Math.max(1, world.relations.size),
        leaderName: leader.def.name,
      };
      hud.setDebug(dbg);
      compositor.setDebug(dbg);

      let totalTension = 0;
      let relCount = 0;
      for (const rel of world.relations.values()) {
        totalTension += rel.tension;
        relCount++;
      }
      const avgTension = relCount > 0 ? totalTension / relCount : 0;
      compositor.setGlobalTension(avgTension);
      audio.setGlobalTension(avgTension);

      const sorted = [...world.countries].sort((a, b) => b.power - a.power);
      const prevPowers = new Map(world.countries.map((c) => [c.def.id, c.prevPower]));
      const lb: LeaderboardEntry[] = sorted.slice(0, 5).map((c, i) => ({
        emoji: flagEmoji(c.def.code),
        name: c.def.name,
        power: c.power,
        rank: i + 1,
        delta: c.power - (prevPowers.get(c.def.id) ?? c.power),
      }));
      compositor.setLeaderboard(lb);

      const bHook = world.story.boredom;
      if (bHook.hookActive && bHook.hookType) {
        const hookLabels: Record<string, string> = {
          'unusual-activity': '🔎 INVESTIGATING...',
          'rumor': '💬 MONITORING SITUATION...',
          'buildup': '📤 FORCES MOVING...',
          'mystery-signal': '📡 SIGNAL DETECTED...',
        };
        compositor.showHook(hookLabels[bHook.hookType] ?? '🔎 INVESTIGATING...');
        audio.play('hook', 0.3);
      } else {
        compositor.hideHook();
      }
    }

    const activePreds = getActivePredictions(predictionStore);
    if (activePreds.length > 0) {
      const pred = activePreds[0];
      const now = Date.now();
      const remaining = Math.max(0, (pred.lockAt - now) / 1000);
      const total = pred.totalVotes || 1;
      const options = pred.options.map((o) => ({
        label: o.label,
        icon: o.icon,
        percentage: Math.round((o.votes / total) * 100),
      }));
      predictionOverlay.show(pred.title, pred.subtitle, options, remaining);
      if (remaining <= 0 && !predictionOverlay.getState().locked) {
        predictionOverlay.lock();
      }
    } else {
      predictionOverlay.hide();
    }
    predictionOverlay.update(dt);

    const sit = getDirectorSituation(world);
    if (sit && frame % 60 === 0) {
      const aBody = world.bodies.find((b) => b.def.id === sit.actors[0]);
      const bBody = world.bodies.find((b) => b.def.id === sit.actors[1]);
      if (aBody && bBody) {
        const mx = (aBody.x + bBody.x) / 2;
        const my = (aBody.y + bBody.y) / 2;
        const zoom = 1.3 + sit.escalation * 0.7;
        camera.setTarget(mx, my, zoom);
      }
    }

    compositor.update(dt);

    if (frame % 300 === 0) {
      const metrics = simHealth.collectMetrics(world, fpsEma, world.perf.avgTickMs);
      const healthStatus = simHealth.checkHealth(world);

      if (healthStatus.overall !== 'healthy') {
        const alerts = healthStatus.checks
          .filter((c) => c.status !== 'pass')
          .map((c) => ({
            source: 'health-monitor',
            severity: c.status === 'fail' ? 'critical' as const : 'warn' as const,
            message: c.message,
            time: world.time,
          }));
        world.monitoring.watchdogAlerts.push(...alerts);
        if (world.monitoring.watchdogAlerts.length > 100) {
          world.monitoring.watchdogAlerts = world.monitoring.watchdogAlerts.slice(-50);
        }
      }

      const warAlert = warBalance.detectEndlessWar(world);
      if (warAlert) {
        world.monitoring.watchdogAlerts.push({
          source: 'war-balance', severity: 'warn', message: warAlert, time: world.time,
        });
      }

      const eventAlert = eventWatchdog.check(world);
      if (eventAlert) {
        world.monitoring.watchdogAlerts.push({
          source: eventAlert.source, severity: eventAlert.severity, message: eventAlert.message, time: eventAlert.timestamp,
        });
      }

      const storyAlert = storyWatchdog.check(world);
      if (storyAlert) {
        world.monitoring.watchdogAlerts.push({
          source: storyAlert.source, severity: storyAlert.severity, message: storyAlert.message, time: storyAlert.timestamp,
        });
      }

      const camAlert = cameraWatchdog.check(world, camera.x, camera.y);
      if (camAlert) {
        world.monitoring.watchdogAlerts.push({
          source: camAlert.source, severity: camAlert.severity, message: camAlert.message, time: camAlert.timestamp,
        });
        simHealth.recordCameraInterruption();
      }

      const bcastAlert = broadcastWatchdog.check(fpsEma, metrics.memoryMB);
      if (bcastAlert) {
        world.monitoring.watchdogAlerts.push({
          source: bcastAlert.source, severity: bcastAlert.severity, message: bcastAlert.message, time: bcastAlert.timestamp,
        });
      }
    }

    if (frame % 10 === 0) {
      const latest = world.news[world.news.length - 1];
      if (latest && latest.id > lastNewsId) {
        antiRepetition.recordEvent({
          kind: latest.kind,
          time: latest.time,
          actorA: latest.actorA,
          actorB: latest.actorB,
          spectacle: latest.spectacle,
        });
        boredomAnalytics.recordEvent(world, {
          kind: latest.kind,
          time: latest.time,
          spectacle: latest.spectacle,
        });
      }

      const bHook = world.story.boredom;
      if (bHook.hookActive && bHook.hookType) {
        boredomAnalytics.recordHookTrigger(world, bHook.hookType);
      }
    }

    if (frame % 600 === 0) {
      const cb = countryBalance.report(world);
      if (cb.alerts.length > 0) {
        world.monitoring.watchdogAlerts.push(
          ...cb.alerts.map((a) => ({ source: 'country-balance', severity: 'warn' as const, message: a, time: world.time }))
        );
      }
      const wb = warBalance.report(world);
      if (wb.alerts.length > 0) {
        world.monitoring.watchdogAlerts.push(
          ...wb.alerts.map((a) => ({ source: 'war-balance', severity: 'warn' as const, message: a, time: world.time }))
        );
      }
    }
  });
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'h') { hud.toggleHud(); compositor.toggleHud(); }
    else if (k === 'd') { hud.toggleDebug(); compositor.toggleDebug(); }
    else if (k === 'g') guides.visible = !guides.visible;
    else if (k === 'm') {
      audio.init();
      audio.resume();
      const muted = audio.toggleMute();
      compositor.showAnnounce(muted ? '🔇 MUTED' : '🔊 UNMUTED', '');
    }
    else if (k === 'w') {
      for (const war of world.wars.values()) {
        if (!war.outcome) { camera.focusWar(war.id); camera.shake(4); break; }
      }
    }
    else if (k === 'r') {
      camera.focusEvent(0.1);
    }
    else if (k === 'p') {
      if (stream.state.recording) {
        stream.downloadRecording();
        compositor.showAnnounce('📹 RECORDING SAVED', stream.state.filename);
      } else {
        stream.startRecording();
        compositor.showAnnounce('🔴 RECORDING STARTED', 'Press P to stop & save');
      }
    }
  });

  (stage.app.canvas as HTMLCanvasElement).addEventListener('click', () => {
    audio.init();
    audio.resume();
    audio.play('ambient');
  }, { once: true });

  // Cleanup central viz on page unload / HMR
  window.addEventListener('beforeunload', () => orbitCenter.destroy(), { once: true });
  if (import.meta.hot) {
    import.meta.hot.dispose(() => orbitCenter.destroy());
  }
}

void boot();
