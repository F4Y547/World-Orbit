import { CONFIG } from '../config';
import type { Rng } from '../core/rng';
import type { ActiveSequence, BoredomState, CountryRuntime, EventKind, HookType, Spectacle, SpectacleMood, SpectacleVisual, StoryTier, WorldState } from './types';
import { declareWar } from './war';
import { flagEmoji, pairKey } from './diplomacy';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function createStoryState(): WorldState['story'] {
  return {
    nextRollAt: CONFIG.story.rollSpacingSec[0] * 0.5,
    lastFire: { common: -1e9, uncommon: -1e9, rare: -1e9, legendary: -1e9 },
    lastLegendary: -1e9,
    lastBigMoment: 0,
    chains: [],
    mysteries: [],
    nextSeqId: 1,
    boredom: {
      recentKinds: [],
      tensionAccumulator: 0,
      hookActive: false,
      hookType: null,
      hookStartTime: 0,
      hookLevel: 0,
      lastHookTime: -1e9,
    },
  };
}

const MOOD_MAP: Partial<Record<EventKind, SpectacleMood>> = {
  'war-declared': 'dramatic',
  'battle': 'dramatic',
  'victory': 'triumphant',
  'peace': 'calm',
  'mystery': 'ominous',
  'mystery-resolve': 'ominous',
  'boom': 'triumphant',
  'economic-crisis': 'tense',
  'alliance-form': 'triumphant',
  'betrayal': 'dramatic',
  'superpower-crisis': 'dramatic',
  'global-tension': 'ominous',
  'transformation': 'dramatic',
  'new-era': 'triumphant',
  'border-dispute': 'tense',
  'rebellion': 'dramatic',
  'leadership-change': 'dramatic',
  'summit': 'calm',
  'election': 'calm',
  'breakthrough': 'triumphant',
  'rhetoric': 'tense',
  'sanctions': 'tense',
  'failed-talks': 'tense',
  'trade-deal': 'calm',
  'trade-mission': 'calm',
  'cultural-exchange': 'calm',
  'joint-exercise': 'tense',
  'treaty': 'calm',
  'resource-discovery': 'triumphant',
  'massive-alliance': 'dramatic',
  'refusal': 'tense',
  'buildup': 'tense',
  'summit-proposal': 'calm',
};

const VISUAL_MAP: Partial<Record<EventKind, SpectacleVisual>> = {
  'war-declared': 'flash',
  'victory': 'flash',
  'mystery': 'glitch',
  'mystery-resolve': 'glitch',
  'betrayal': 'flash',
  'superpower-crisis': 'pulse',
  'global-tension': 'pulse',
  'transformation': 'ripple',
  'new-era': 'ripple',
  'rebellion': 'pulse',
  'leadership-change': 'flash',
  'massive-alliance': 'flash',
};

export function eventSpectacle(kind: EventKind, tier: StoryTier): Spectacle {
  const intensityBase = CONFIG.spectacle.tierIntensity[tier];
  const mood = MOOD_MAP[kind] ?? 'calm';
  const visual = VISUAL_MAP[kind] ?? 'none';
  const moodBoost: Record<SpectacleMood, number> = {
    calm: 0,
    tense: 0.1,
    dramatic: 0.2,
    triumphant: 0.15,
    ominous: 0.15,
  };
  const intensity = clamp(intensityBase + moodBoost[mood], 0, 1);
  return { intensity, mood, tier, visual };
}

function pushNews(
  w: WorldState,
  kind: EventKind,
  actorA: string,
  actorB: string,
  delta: number,
  headline: string,
  tier?: StoryTier,
): void {
  const spec = tier ? eventSpectacle(kind, tier) : undefined;
  w.news.push({
    id: w.nextEventId++,
    time: w.time,
    day: w.day,
    kind,
    actorA,
    actorB,
    delta,
    headline,
    spectacle: spec,
  });
  if (w.news.length > CONFIG.diplomacy.newsCap) w.news.shift();
}

function pickCountry(w: WorldState, rng: Rng, filter?: (id: string) => boolean): string | null {
  const pool = w.countries.filter((c) => !filter || filter(c.def.id));
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)].def.id;
}

function pickPair(w: WorldState, rng: Rng, pred?: (score: number) => boolean): [string, string] | null {
  const rels = [...w.relations.values()].filter((r) => !pred || pred(r.score));
  if (rels.length === 0) return null;
  const rel = rels[Math.floor(rng() * rels.length)];
  return rng() < 0.5 ? [rel.a, rel.b] : [rel.b, rel.a];
}

function seq(
  w: WorldState,
  list: ActiveSequence[],
  label: string,
  steps: ActiveSequence['steps'],
  countdownEnd: number | null = null,
): void {
  list.push({ id: w.story.nextSeqId++, label, steps, idx: 0, countdownEnd });
}

export function startMystery(w: WorldState, rng: Rng): void {
  const variant = rng();
  const target = pickCountry(w, rng);
  if (!target) return;
  const c = w.byId.get(target)!;
  const e = flagEmoji(c.def.code);

  if (variant < 0.5) {
    seq(w, w.story.mysteries, 'signal', [
      {
        at: w.time,
        run: (world) => {
          pushNews(world, 'mystery', target, '', 0, `❓ UNKNOWN SIGNAL DETECTED — ORIGIN UNKNOWN`);
        },
      },
      {
        at: w.time + 75,
        run: (world) => {
          pushNews(world, 'mystery', target, '', 0, `🛰 SIGNAL SOURCE: TRACKING...`);
        },
      },
      {
        at: w.time + 150,
        run: (world) => {
          pushNews(world, 'mystery', target, '', 0, `🚨 SECOND SIGNAL DETECTED — COORDINATES SHIFTING`);
        },
      },
      {
        at: w.time + 260,
        run: (world, r) => {
          const found = r() < 0.6;
          if (found) {
            c.technology = clamp(c.technology + 12 + r() * 8, 1, 100);
            c.reputation += 6;
            pushNews(
              world,
              'mystery-resolve',
              target,
              '',
              25,
              `📡 SIGNAL TRACED TO ${e} ${c.def.name} — RESEARCH BREAKTHROUGH`,
            );
          } else {
            pushNews(world, 'mystery-resolve', target, '', -5, `🌫 SIGNAL LOST — ORIGIN NEVER FOUND`);
          }
        },
      },
    ], w.time + 260);
  } else {
    seq(w, w.story.mysteries, 'object', [
      {
        at: w.time,
        run: (world) => {
          pushNews(world, 'mystery', target, '', 0, `❓ UNIDENTIFIED OBJECT ON RADAR — ALTITUDE RISING`);
        },
      },
      {
        at: w.time + 80,
        run: (world) => {
          pushNews(world, 'mystery', '', target, 0, `🔭 OBSERVATORIES CONFIRM — OBJECT IS REAL`);
        },
      },
      {
        at: w.time + 170,
        run: (world, r) => {
          const calm = r() < 0.55;
          if (calm) {
            for (const cc of world.countries) cc.morale += 3;
            pushNews(world, 'mystery-resolve', target, '', 10, `🎈 OBJECT IDENTIFIED — RESEARCH BALLOON · WORLD RELIEVED`);
          } else {
            for (const cc of world.countries) {
              cc.military += 3;
              cc.stability -= 2;
            }
            pushNews(world, 'mystery-resolve', target, '', -15, `🛸 OBJECT VANISHED — GOVERNMENTS DEMAND ANSWERS`);
          }
          for (const cc of world.countries) {
            cc.stability = clamp(cc.stability, 5, 98);
            cc.military = clamp(cc.military, 4, 100);
          }
        },
      },
    ], w.time + 170);
  }
}

interface ChainSpec {
  label: string;
  build: (w: WorldState, rng: Rng) => ActiveSequence['steps'] | null;
}

const CHAINS: ChainSpec[] = [
  {
    label: 'resource-rush',
    build: (w, rng) => {
      const aId = pickCountry(w, rng);
      if (!aId) return null;
      const bId = pickCountry(w, rng, (id) => id !== aId);
      if (!bId) return null;
      const A = w.byId.get(aId)!;
      const B = w.byId.get(bId)!;
      const eA = flagEmoji(A.def.code);
      const eB = flagEmoji(B.def.code);
      const key = pairKey(aId, bId);

      return [
        {
          at: w.time,
          run: (world) => {
            A.resourcesScore += 3.5;
            A.gdp *= 1.02;
            pushNews(world, 'resource-discovery', aId, '', 15, `⛏ MASSIVE DEPOSIT DISCOVERED IN ${eA} ${A.def.name}`);
          },
        },
        {
          at: w.time + 40,
          run: (world) => {
            const rel = world.relations.get(key);
            if (!rel) return;
            rel.score -= 8;
            rel.tension = clamp(rel.tension + 18, 0, 100);
            pushNews(world, 'demand-access', bId, aId, -8, `📢 ${eB} ${B.def.name} DEMANDS ACCESS TO ${eA} ${A.def.name} DEPOSITS`);
          },
        },
        {
          at: w.time + 85,
          run: (world) => {
            const rel = world.relations.get(key);
            if (!rel) return;
            rel.score -= 12;
            rel.tension = clamp(rel.tension + 14, 0, 100);
            pushNews(world, 'refusal', aId, bId, -12, `⛔ ${eA} ${A.def.name} REFUSES — "RESOURCES ARE SOVEREIGN"`);
          },
        },
        {
          at: w.time + 140,
          run: (world, r) => {
            A.military += 4 + r() * 3;
            B.military += 3 + r() * 3;
            const rel = world.relations.get(key);
            if (rel) rel.tension = clamp(rel.tension + 15, 0, 100);
            pushNews(world, 'buildup', aId, bId, -10, `🎖 MILITARY BUILDUP — ${eA} ${A.def.name} · ${eB} ${B.def.name} BORDER ZONES ON ALERT`);
          },
        },
      ];
    },
  },
  {
    label: 'summit-arc',
    build: (w, rng) => {
      const hottest = [...w.relations.values()]
        .filter((r) => r.score < -20 && !w.truces.get(pairKey(r.a, r.b)))
        .sort((a, b) => b.tension - a.tension)[0];
      if (!hottest) return null;
      const aId = hottest.a;
      const bId = hottest.b;
      const A = w.byId.get(aId)!;
      const B = w.byId.get(bId)!;
      const eA = flagEmoji(A.def.code);
      const eB = flagEmoji(B.def.code);
      const key = pairKey(aId, bId);
      const success = rng() < 0.5;

      return [
        {
          at: w.time,
          run: (world) => {
            pushNews(world, 'summit-proposal', aId, bId, 5, `🕊 LAST-CHANCE SUMMIT PROPOSED — ${eA} ${A.def.name} · ${eB} ${B.def.name}`);
          },
        },
        {
          at: w.time + 60,
          run: (world) => {
            const rel = world.relations.get(key);
            if (!rel) return;
            if (success) {
              rel.score = clamp(rel.score + 22, -100, 100);
              rel.tension = clamp(rel.tension - 32, 0, 100);
              A.influence += 3;
              B.influence += 3;
              pushNews(world, 'treaty', aId, bId, 20, `✍ SUMMIT SUCCESS — ${eA} ${A.def.name} AND ${eB} ${B.def.name} STEP BACK FROM BRINK`);
            } else {
              rel.score -= 10;
              rel.tension = clamp(rel.tension + 16, 0, 100);
              A.publicSupport -= 4;
              B.publicSupport -= 4;
              pushNews(world, 'failed-talks', aId, bId, -18, `🚫 SUMMIT COLLAPSES — ${eA} ${A.def.name} · ${eB} ${B.def.name} TALKS END IN WALKOUT`);
            }
          },
        },
      ];
    },
  },
  {
    label: 'rebellion-arc',
    build: (w, rng) => {
      const aId = pickCountry(w, rng, (id) => {
        const c = w.byId.get(id)!;
        return c.warId === null && c.stability < 70;
      });
      if (!aId) return null;
      const A = w.byId.get(aId)!;
      const eA = flagEmoji(A.def.code);
      const coup = rng() < 0.45;

      return [
        {
          at: w.time,
          run: (world) => {
            A.stability -= 7;
            A.morale -= 5;
            pushNews(world, 'rebellion', aId, '', -20, `🔥 MASS PROTESTS ROCK ${eA} ${A.def.name}`);
          },
        },
        {
          at: w.time + 90,
          run: (world, r) => {
            if (coup) {
              const oldType = A.p.type;
              rollPersonalityInto(A, r);
              A.stability = clamp(A.stability + 6, 5, 98);
              A.publicSupport = clamp(45 + r() * 20, 5, 98);
              pushNews(
                world,
                'leadership-change',
                aId,
                '',
                -10,
                `🏛 COUP IN ${eA} ${A.def.name} — NEW LEADERSHIP EMERGES (${oldType.toUpperCase()} → ${A.p.type.toUpperCase()})`,
              );
            } else {
              A.stability = clamp(A.stability + 9, 5, 98);
              A.military -= 1.5;
              pushNews(world, 'leadership-change', aId, '', 8, `⚖ ORDER RESTORED IN ${eA} ${A.def.name} — REFORMS PROMISED`);
            }
          },
        },
      ];
    },
  },
];

function rollPersonalityInto(c: CountryRuntime, rng: Rng): void {
  const roll = rng();
  const type =
    roll < 0.2 ? 'aggressive' : roll < 0.4 ? 'defensive' : roll < 0.6 ? 'diplomatic' : roll < 0.85 ? 'opportunistic' : 'unpredictable';
  const aggBase = type === 'aggressive' ? 0.78 : type === 'defensive' ? 0.24 : type === 'diplomatic' ? 0.32 : 0.5;
  const riskBase = type === 'aggressive' || type === 'unpredictable' ? 0.7 : type === 'opportunistic' ? 0.55 : 0.35;
  c.p = {
    type,
    aggression: clamp(aggBase + rng() * 0.2 - 0.1, 0.05, 1),
    riskTolerance: clamp(riskBase + rng() * 0.2 - 0.1, 0.05, 1),
    techFocus: 0.25 + rng() * 0.6,
  };
}

function chainByLabel(label: string): ChainSpec {
  const spec = CHAINS.find((c) => c.label === label)!;
  return spec;
}

const COMMON_EVENTS: Array<(w: WorldState, rng: Rng) => boolean> = [
  (w, rng) => {
    const id = pickCountry(w, rng);
    if (!id) return false;
    const c = w.byId.get(id)!;
    c.gdp *= 1.03;
    c.morale += 4;
    pushNews(w, 'boom', id, '', 12, `📈 ECONOMIC BOOM IN ${flagEmoji(c.def.code)} ${c.def.name} — MARKETS SOAR`);
    return true;
  },
  (w, rng) => {
    const id = pickCountry(w, rng, (x) => w.byId.get(x)!.warId === null);
    if (!id) return false;
    const c = w.byId.get(id)!;
    c.publicSupport = clamp(40 + rng() * 35, 5, 98);
    c.stability = clamp(c.stability + (rng() * 10 - 3), 5, 98);
    pushNews(w, 'election', id, '', 6, `🗳 ELECTION IN ${flagEmoji(c.def.code)} ${c.def.name} — NATION VOTES`);
    return true;
  },
  (w, rng) => {
    const id = pickCountry(w, rng);
    if (!id) return false;
    const c = w.byId.get(id)!;
    c.technology = clamp(c.technology + 4 + rng() * 5, 1, 100);
    pushNews(w, 'breakthrough', id, '', 14, `🔬 ${flagEmoji(c.def.code)} ${c.def.name} ANNOUNCES TECHNOLOGY BREAKTHROUGH`);
    return true;
  },
  (w, rng) => {
    const pair = pickPair(w, rng, (s) => s > 30);
    if (!pair) return false;
    const [aId, bId] = pair;
    const A = w.byId.get(aId)!;
    const B = w.byId.get(bId)!;
    const rel = w.relations.get(pairKey(aId, bId))!;
    rel.score = clamp(rel.score + 6, -100, 100);
    A.gdp *= 1.005;
    B.gdp *= 1.005;
    pushNews(w, 'trade-deal', aId, bId, 10, `🤝 EXPANDED TRADE PACT — ${flagEmoji(A.def.code)} ${A.def.name} · ${flagEmoji(B.def.code)} ${B.def.name}`);
    return true;
  },
  (w, rng) => {
    const pair = pickPair(w, rng, (s) => s < -15);
    if (!pair) return false;
    const [aId, bId] = pair;
    const A = w.byId.get(aId)!;
    const B = w.byId.get(bId)!;
    const rel = w.relations.get(pairKey(aId, bId))!;
    rel.tension = clamp(rel.tension + 10, 0, 100);
    pushNews(w, 'border-dispute', aId, bId, -8, `⚠ BORDER CLASH — ${flagEmoji(A.def.code)} ${A.def.name} · ${flagEmoji(B.def.code)} ${B.def.name}`);
    return true;
  },
];

const UNCOMMON_EVENTS: Array<(w: WorldState, rng: Rng) => boolean> = [
  (w, rng) => {
    const pair = pickPair(w, rng, (s) => s >= 35);
    if (!pair) return false;
    const [aId, bId] = pair;
    const A = w.byId.get(aId)!;
    const B = w.byId.get(bId)!;
    const rel = w.relations.get(pairKey(aId, bId))!;
    rel.score = clamp(Math.max(rel.score, 60), -100, 100);
    A.influence += 3;
    B.influence += 3;
    A.morale += 3;
    B.morale += 3;
    pushNews(w, 'alliance-form', aId, bId, 25, `🔵 ALLIANCE SIGNED — ${flagEmoji(A.def.code)} ${A.def.name} + ${flagEmoji(B.def.code)} ${B.def.name}`);
    return true;
  },
  (w, rng) => {
    const id = pickCountry(w, rng);
    if (!id) return false;
    const c = w.byId.get(id)!;
    const gdpBefore = c.gdp;
    c.gdp *= 0.92;
    c.stability = clamp(c.stability - 11, 5, 98);
    c.morale = clamp(c.morale - 8, 5, 98);
    void gdpBefore;
    pushNews(w, 'economic-crisis', id, '', -25, `📉 ECONOMIC CRISIS HITS ${flagEmoji(c.def.code)} ${c.def.name} — MARKETS CRASH`);
    return true;
  },
  (w, rng) => {
    const spec = chainByLabel('rebellion-arc');
    const steps = spec.build(w, rng);
    if (!steps) return false;
    seq(w, w.story.chains, spec.label, steps);
    return true;
  },
  (w, rng) => {
    const spec = chainByLabel('summit-arc');
    const steps = spec.build(w, rng);
    if (!steps) return false;
    seq(w, w.story.chains, spec.label, steps);
    return true;
  },
];

const RARE_EVENTS: Array<(w: WorldState, rng: Rng) => boolean> = [
  (w, rng) => surpriseWar(w, rng),
  (w, rng) => {
    const pair = pickPair(w, rng, (s) => s >= 50);
    if (!pair) return false;
    const [betrayer, victim] = rng() < 0.5 ? pair : [pair[1], pair[0]];
    const A = w.byId.get(betrayer)!;
    const B = w.byId.get(victim)!;
    const rel = w.relations.get(pairKey(betrayer, victim))!;
    rel.score = -42;
    rel.tension = clamp(rel.tension + 35, 0, 100);
    A.reputation -= 12;
    B.morale -= 8;
    B.stability -= 4;
    pushNews(w, 'betrayal', betrayer, victim, -40, `🗡 BETRAYAL — ${flagEmoji(A.def.code)} ${A.def.name} STABS ${flagEmoji(B.def.code)} ${B.def.name} IN THE BACK`);
    return true;
  },
  (w, rng) => {
    const targets = w.countries
      .filter((c) => c.ringTarget <= 1 && c.warId === null)
      .sort((a, b) => b.power - a.power)
      .slice(0, 5);
    if (targets.length === 0) return false;
    const c = targets[Math.floor(rng() * targets.length)];
    c.gdp *= 0.76;
    c.military = clamp(c.military - 16, 4, 100);
    c.stability = clamp(c.stability - 17, 5, 98);
    c.morale = clamp(c.morale - 13, 5, 98);
    c.influence = clamp(c.influence - 12, 1, 100);
    pushNews(w, 'superpower-crisis', c.def.id, '', -45, `💥 SUPERPOWER IN FREEFALL — ${flagEmoji(c.def.code)} ${c.def.name} TEETERS ON COLLAPSE`);
    return true;
  },
  (w, rng) => {
    const leader = [...w.countries].sort((a, b) => b.influence - a.influence)[0];
    const members = [
      leader,
      ...w.countries
        .filter((c) => c !== leader && c.warId === null)
        .sort((a, b) => {
          const ra = w.relations.get(pairKey(leader.def.id, a.def.id))!.score;
          const rb = w.relations.get(pairKey(leader.def.id, b.def.id))!.score;
          return rb - ra;
        })
        .slice(0, 2 + Math.floor(rng() * 3)),
    ];
    if (members.length < 3) return false;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const rel = w.relations.get(pairKey(members[i].def.id, members[j].def.id))!;
        rel.score = clamp(Math.max(rel.score, 48 + rng() * 15), -100, 100);
      }
      members[i].influence = clamp(members[i].influence + 4, 1, 100);
    }
    const names = members.map((m) => `${flagEmoji(m.def.code)} ${m.def.name}`).join(' · ');
    pushNews(w, 'massive-alliance', leader.def.id, '', 45, `🌐 GRAND ALLIANCE FORMED — ${names}`);
    return true;
  },
];

const LEGENDARY_EVENTS: Array<(w: WorldState, rng: Rng) => boolean> = [
  (w, _rng) => {
    let touched = 0;
    for (const rel of w.relations.values()) {
      if (rel.score < 0) {
        rel.tension = clamp(rel.tension + 22 + Math.abs(rel.score) * 0.2, 0, 100);
        touched++;
      }
    }
    for (const c of w.countries) {
      c.military += 4;
      c.morale -= 3;
      c.exhaustion = clamp(c.exhaustion + 5, 0, 100);
    }
    pushNews(w, 'global-tension', '', '', -60, `🌍 GLOBAL CONFLICT WAVE — ${touched} FAULT LINES IGNITE SIMULTANEOUSLY`);
    return true;
  },
  (w, rng) => {
    startMystery(w, rng);
    return w.story.mysteries.length > 0;
  },
  (w, rng) => {
    const id = pickCountry(w, rng);
    if (!id) return false;
    const c = w.byId.get(id)!;
    c.technology = clamp(c.technology + 24, 1, 100);
    c.industry = clamp(c.industry + 15, 5, 100);
    c.gdp *= 1.1;
    pushNews(w, 'transformation', id, '', 60, `✨ CIVILIZATION LEAP — ${flagEmoji(c.def.code)} ${c.def.name} ENTERS A NEW AGE`);
    return true;
  },
  (w, _rng) => {
    for (const c of w.countries) {
      c.debt *= 0.2;
      c.exhaustion = 0;
      c.morale = clamp(c.morale + 8, 5, 98);
    }
    for (const rel of w.relations.values()) {
      rel.tension *= 0.4;
    }
    pushNews(w, 'new-era', '', '', 30, `🌅 DAWN OF A NEW ERA — OLD GRUDGES FADE, DEBTS FORGIVEN`);
    return true;
  },
];

function surpriseWar(w: WorldState, rng: Rng): boolean {
  let activeWars = 0;
  for (const war of w.wars.values()) {
    if (!war.outcome) activeWars++;
  }
  if (activeWars >= CONFIG.war.maxConcurrentWars) return false;

  const candidates = [...w.relations.values()].filter((r) => {
    if (r.score > -35 || r.tension < 45) return false;
    if ((w.truces.get(pairKey(r.a, r.b)) ?? 0) > w.time) return false;
    return w.byId.get(r.a)!.warId === null && w.byId.get(r.b)!.warId === null;
  });
  if (candidates.length === 0) return false;

  const rel = candidates[Math.floor(rng() * candidates.length)];
  const A = w.byId.get(rel.a)!;
  const B = w.byId.get(rel.b)!;
  const scoreA = A.power * 0.35 + A.military * 0.45 + A.p.aggression * 20;
  const scoreB = B.power * 0.35 + B.military * 0.45 + B.p.aggression * 20;
  const attacker = scoreA >= scoreB ? A : B;
  const defender = attacker === A ? B : A;
  declareWar(w, attacker.def.id, defender.def.id, rng);
  pushNews(w, 'rhetoric', attacker.def.id, defender.def.id, -30, `⚡ NO WARNING — ${flagEmoji(attacker.def.code)} ${attacker.def.name} LAUNCHES SURPRISE ATTACK ON ${flagEmoji(defender.def.code)} ${defender.def.name}`);
  return true;
}

export function spawnStoryEvent(w: WorldState, tier: StoryTier, rng: Rng): boolean {
  const pools: Record<StoryTier, Array<(w: WorldState, rng: Rng) => boolean>> = {
    common: COMMON_EVENTS,
    uncommon: UNCOMMON_EVENTS,
    rare: RARE_EVENTS,
    legendary: LEGENDARY_EVENTS,
  };
  const pool = pools[tier];
  for (const fn of pool) {
    const before = w.news.length;
    if (fn(w, rng)) {
      tagNewEvents(w, before, tier);
      for (let i = before; i < w.news.length; i++) trackEventKind(w, w.news[i].kind);
      w.story.lastFire[tier] = w.time;
      if (tier !== 'common') w.story.lastBigMoment = w.time;
      if (tier === 'legendary') w.story.lastLegendary = w.time;
      return true;
    }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const fn = pool[Math.floor(rng() * pool.length)];
    const before = w.news.length;
    if (fn(w, rng)) {
      tagNewEvents(w, before, tier);
      for (let i = before; i < w.news.length; i++) trackEventKind(w, w.news[i].kind);
      w.story.lastFire[tier] = w.time;
      if (tier !== 'common') w.story.lastBigMoment = w.time;
      if (tier === 'legendary') w.story.lastLegendary = w.time;
      return true;
    }
  }
  return false;
}

function tagNewEvents(w: WorldState, fromIdx: number, tier: StoryTier): void {
  for (let i = fromIdx; i < w.news.length; i++) {
    if (!w.news[i].spectacle) {
      w.news[i].spectacle = eventSpectacle(w.news[i].kind, tier);
    }
  }
}

function rollTier(rng: Rng): StoryTier {
  const { common, uncommon, rare, legendary } = CONFIG.story.weights;
  const total = common + uncommon + rare + legendary;
  let roll = rng() * total;
  if ((roll -= common) < 0) return 'common';
  if ((roll -= uncommon) < 0) return 'uncommon';
  if ((roll -= rare) < 0) return 'rare';
  return 'legendary';
}

function advanceSequences(w: WorldState, rng: Rng): void {
  for (const collection of [w.story.chains, w.story.mysteries]) {
    for (const sequence of [...collection]) {
      while (sequence.idx < sequence.steps.length && sequence.steps[sequence.idx].at <= w.time) {
        sequence.steps[sequence.idx].run(w, rng);
        sequence.idx++;
      }
      if (sequence.idx >= sequence.steps.length) {
        collection.splice(collection.indexOf(sequence), 1);
      }
    }
  }
}

export function storyTick(w: WorldState, rng: Rng): void {
  advanceSequences(w, rng);

  if (w.time < w.story.nextRollAt) return;

  const gaps = CONFIG.story.tierMinGapSec;
  const eligible: StoryTier[] = ['common'];
  if (w.time - w.story.lastFire.uncommon >= gaps.uncommon) eligible.push('uncommon');
  if (w.time - w.story.lastFire.rare >= gaps.rare) eligible.push('rare');
  if (
    w.time - w.story.lastFire.legendary >= gaps.legendary &&
    w.time - w.story.lastLegendary >= CONFIG.story.tierMinGapSec.legendary
  ) {
    eligible.push('legendary');
  }

  let tier = rollTier(rng);
  if (!eligible.includes(tier)) tier = eligible[eligible.length - 1];

  const spawned = spawnStoryEvent(w, tier, rng);
  const [lo, hi] = CONFIG.story.rollSpacingSec;
  w.story.nextRollAt = w.time + lo + rng() * (hi - lo);

  if (spawned && tier !== 'common') markBigMoment(w);
}

export function markBigMoment(w: WorldState): void {
  w.story.lastBigMoment = w.time;
  const b = w.story.boredom;
  b.hookActive = false;
  b.hookType = null;
  b.hookLevel = 0;
  b.tensionAccumulator = 0;
}

function trackEventKind(w: WorldState, kind: EventKind): void {
  const b = w.story.boredom;
  b.recentKinds.push(kind);
  if (b.recentKinds.length > CONFIG.retention.diversityWindow) {
    b.recentKinds.shift();
  }
}

function isDiverse(w: WorldState): boolean {
  const kinds = w.story.boredom.recentKinds;
  if (kinds.length < 5) return true;
  const last5 = kinds.slice(-5);
  const counts = new Map<EventKind, number>();
  for (const k of last5) counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const count of counts.values()) {
    if (count > CONFIG.retention.maxSameKind) return false;
  }
  return true;
}

function pickHookTarget(w: WorldState, rng: Rng): { a: string; b: string } | null {
  const hostile = [...w.relations.values()]
    .filter((r) => r.tension > 30)
    .sort((a, b) => b.tension - a.tension);
  if (hostile.length > 0) {
    const r = hostile[Math.floor(rng() * Math.min(5, hostile.length))];
    return { a: r.a, b: r.b };
  }
  const c1 = pickCountry(w, rng);
  const c2 = pickCountry(w, rng, (id) => id !== c1);
  if (c1 && c2) return { a: c1, b: c2 };
  return null;
}

function spawnHookEvent(w: WorldState, level: number, rng: Rng): boolean {
  const target = pickHookTarget(w, rng);
  if (!target) return false;
  const A = w.byId.get(target.a);
  const B = w.byId.get(target.b);
  if (!A || !B) return false;

  const b = w.story.boredom;
  b.hookActive = true;
  b.hookStartTime = w.time;
  b.hookLevel = level;
  b.lastHookTime = w.time;

  const tier: StoryTier = level <= 1 ? 'common' : level <= 2 ? 'common' : 'uncommon';

  if (level === 1) {
    const hookType: HookType = 'unusual-activity';
    b.hookType = hookType;
    const rel = w.relations.get(pairKey(target.a, target.b));
    if (rel) rel.tension = clamp(rel.tension + 5, 0, 100);
    const before = w.news.length;
    pushNews(w, 'border-dispute', target.a, target.b, -5,
      `🔎 UNUSUAL MILITARY ACTIVITY DETECTED near ${flagEmoji(A.def.code)} ${A.def.name} border`);
    tagNewEvents(w, before, tier);
    return true;
  }

  if (level === 2) {
    const hookType: HookType = 'rumor';
    b.hookType = hookType;
    A.stability = clamp(A.stability - 3, 5, 98);
    const before = w.news.length;
    pushNews(w, 'rhetoric', target.a, target.b, -8,
      `💬 UNCONFIRMED REPORTS of political tensions in ${flagEmoji(A.def.code)} ${A.def.name}`);
    tagNewEvents(w, before, tier);
    return true;
  }

  if (level === 3) {
    const hookType: HookType = 'buildup';
    b.hookType = hookType;
    A.military = clamp(A.military + 4, 1, 100);
    const rel = w.relations.get(pairKey(target.a, target.b));
    if (rel) rel.tension = clamp(rel.tension + 10, 0, 100);
    const before = w.news.length;
    pushNews(w, 'buildup', target.a, target.b, -12,
      `📤 ${flagEmoji(A.def.code)} ${A.def.name} ACCUMULATES FORCES near ${flagEmoji(B.def.code)} ${B.def.name} border`);
    tagNewEvents(w, before, tier);
    return true;
  }

  return false;
}

export function retentionCheck(w: WorldState, rng: Rng): void {
  const quiet = w.time - w.story.lastBigMoment;
  const b = w.story.boredom;
  const R = CONFIG.retention;

  if (quiet < R.breatheSec) return;

  if (quiet >= R.crisisAfterSec) {
    const tier = isDiverse(w) ? 'uncommon' : 'rare';
    const spawned = spawnStoryEvent(w, tier, rng);
    if (spawned) markBigMoment(w);
    return;
  }

  if (quiet >= R.hookLevel3Sec && (!b.hookActive || b.hookLevel < 3)) {
    if (w.time - b.lastHookTime >= R.hookCooldownSec) {
      spawnHookEvent(w, 3, rng);
    }
  } else if (quiet >= R.hookLevel2Sec && (!b.hookActive || b.hookLevel < 2)) {
    if (w.time - b.lastHookTime >= R.hookCooldownSec) {
      spawnHookEvent(w, 2, rng);
    }
  } else if (quiet >= R.hookLevel1Sec && !b.hookActive) {
    if (w.time - b.lastHookTime >= R.hookCooldownSec) {
      spawnHookEvent(w, 1, rng);
    }
  }

  if (quiet >= R.hookLevel3Sec + 60 && b.hookActive) {
    const spawned = spawnStoryEvent(w, 'uncommon', rng);
    if (spawned) markBigMoment(w);
  }
}

export function antiBoringCheck(w: WorldState, rng: Rng): void {
  retentionCheck(w, rng);
}
