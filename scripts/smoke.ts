import { createWorld, stepWorld } from '../src/sim/world';
import { relationKind } from '../src/sim/types';
import { declareWar } from '../src/sim/war';
import { CONFIG } from '../src/config';
import {
  antiBoringCheck,
  spawnStoryEvent,
  startMystery,
  storyTick,
} from '../src/sim/story';

function report(tag: string, world: ReturnType<typeof createWorld>, startPowers: Map<string, number>): boolean {
  let nan = false;
  const check = (v: number): number => {
    if (!Number.isFinite(v)) nan = true;
    return v;
  };

  console.log(`[${tag}] sim time: ${world.time.toFixed(0)}s  day: ${world.day}  news: ${world.news.length}`);
  const sorted = [...world.countries].sort((a, b) => b.power - a.power);
  for (const c of sorted) {
    const dp = c.power - startPowers.get(c.def.id)!;
    console.log(
      `${c.def.name.padEnd(14)} pwr ${check(c.power).toFixed(1).padStart(6)} (${dp >= 0 ? '+' : ''}${dp.toFixed(1)}) gdp ${check(c.gdp).toFixed(0).padStart(7)} mil ${check(c.military).toFixed(0).padStart(3)} mor ${check(c.morale).toFixed(0).padStart(3)} exh ${c.exhaustion.toFixed(0).padStart(3)} [${c.p.type}]`,
    );
  }

  const kinds: Record<string, number> = {};
  let sum = 0;
  for (const rel of world.relations.values()) {
    kinds[relationKind(rel.score)] = (kinds[relationKind(rel.score)] ?? 0) + 1;
    sum += rel.score;
    check(rel.score);
    check(rel.tension);
  }
  console.log('relations:', kinds, 'avg', (sum / world.relations.size).toFixed(1));

  const wars = [...world.wars.values()];
  console.log('wars:', wars.length);
  for (const war of wars) {
    console.log(
      `#${war.id} ${war.attackerId} vs ${war.defenderId} obj=${war.objective} outcome=${war.outcome ?? 'ACTIVE'} battles=${war.battles.length} momentum=${war.momentum.toFixed(0)} terr=${war.territory.toFixed(1)}% startDay=${war.startDay}`,
    );
  }
  console.log('--- last news ---');
  for (const e of world.news.slice(-10)) console.log(`D${e.day}`, e.headline);
  return nan;
}

const TICKS = Number(process.env.SMOKE_TICKS ?? 60 * 150);

console.log('=== PART 1: natural run ===');
const world = createWorld(20260825);
const startPowers = new Map(world.countries.map((c) => [c.def.id, c.power]));
for (let i = 0; i < TICKS; i++) stepWorld(world, 1 / 60);

const eligible: string[] = [];
for (const rel of world.relations.values()) {
  if (rel.score <= -50 && rel.tension >= 65) eligible.push(`${rel.a}~${rel.b}`);
}
console.log('war-eligible pairs:', eligible.length ? eligible.join(', ') : 'none');
const nan1 = report('natural', world, startPowers);

console.log('\n=== PART 2: forced war lifecycle (brazil vs argentina) ===');
const w2 = createWorld(777);
const startPowers2 = new Map(w2.countries.map((c) => [c.def.id, c.power]));
const pre = {
  brazilGdp: w2.byId.get('brazil')!.gdp,
  argentinaGdp: w2.byId.get('argentina')!.gdp,
  brazilInfluence: w2.byId.get('brazil')!.influence,
  argentinaInfluence: w2.byId.get('argentina')!.influence,
};
declareWar(w2, 'brazil', 'argentina', w2.rngWar);
const war = [...w2.wars.values()][0];
const MAX_STEPS = Math.ceil((CONFIG.war.maxDurationSec + 60) * 60);
let steps = 0;
for (; steps < MAX_STEPS; steps++) {
  stepWorld(w2, 1 / 60);
  if (war.outcome) break;
}
if (!war.outcome) {
  console.error('FAIL: forced war never ended within window');
  process.exit(1);
}
const durSec = steps / 60;
console.log(`war ended after ${durSec.toFixed(0)}s (${(durSec / 24).toFixed(1)} days), outcome=${war.outcome}, battles=${war.battles.length}`);

const loserId = war.outcome === 'attacker' ? 'argentina' : war.outcome === 'defender' ? 'brazil' : null;
if (loserId) {
  const loser = w2.byId.get(loserId)!;
  const winner = w2.byId.get(loserId === 'brazil' ? 'argentina' : 'brazil')!;
  const gdpDrop = pre[loserId === 'brazil' ? 'brazilGdp' : 'argentinaGdp'];
  console.log(`loser ${loserId}: morale ${loser.morale.toFixed(0)} support ${loser.publicSupport.toFixed(0)} defeatUntil in ${(loser.defeatUntil - w2.time).toFixed(0)}s`);
  if (loser.gdp > gdpDrop) {
    console.error('FAIL: loser GDP did not drop');
    process.exit(1);
  }
  const preWinnerInf = loserId === 'brazil' ? pre.argentinaInfluence : pre.brazilInfluence;
  if (winner.influence <= preWinnerInf) {
    console.error('FAIL: winner influence not boosted');
    process.exit(1);
  }
}
const truceKey = ['argentina|brazil', 'brazil|argentina'].find((k) => w2.truces.has(k));
if (!truceKey || w2.truces.get(truceKey)! < w2.time) {
  console.error('FAIL: truce not registered');
  process.exit(1);
}
const rel = w2.relations.get('argentina|brazil');
if (!rel || rel.score !== -45) {
  console.error('FAIL: post-war relation not set to grudge value');
  process.exit(1);
}

const nan2 = report('forced', w2, startPowers2);

if (nan1) {
  console.error('FAIL: non-finite values in natural run');
  process.exit(1);
}

console.log('\n=== PART 3: story engine ===');
const w3 = createWorld(4242);
const rng3 = w3.rngStory;
const newsBefore = w3.news.length;

for (const tier of ['common', 'uncommon', 'rare', 'legendary'] as const) {
  const ok = spawnStoryEvent(w3, tier, rng3);
  if (!ok) {
    console.error(`FAIL: ${tier} story event failed to spawn`);
    process.exit(1);
  }
}
if (w3.news.length - newsBefore < 4) {
  console.error('FAIL: expected at least 4 new news entries from tier spawns');
  process.exit(1);
}
console.log(`tier spawns OK — ${w3.news.length - newsBefore} events, lastBigMoment=${w3.story.lastBigMoment.toFixed(0)}`);
for (const e of w3.news.slice(-4)) console.log(`  D${e.day} [${e.kind}]`, e.headline);

startMystery(w3, rng3);
if (w3.story.mysteries.length !== 1) {
  console.error('FAIL: mystery did not start');
  process.exit(1);
}
const mystery = w3.story.mysteries[0];
for (let i = 0; i < Math.ceil((mystery.countdownEnd ?? 0) + 5); i++) stepWorld(w3, 1);
if (w3.story.mysteries.length !== 0) {
  console.error('FAIL: mystery never resolved');
  process.exit(1);
}
const mysteryNews = w3.news.filter(
  (e) => (e.kind === 'mystery' || e.kind === 'mystery-resolve') && e.id > w3.news[newsBefore]?.id,
);
console.log(`mystery arc OK — resolved with ${mysteryNews.length >= 2 ? 'multi-stage' : '?'} beats`);

const quietWorld = createWorld(99);
quietWorld.story.lastBigMoment = quietWorld.time - CONFIG.story.deepBoredAfterSec - 10;
const qn = quietWorld.news.length;
antiBoringCheck(quietWorld, quietWorld.rngStory);
if (quietWorld.news.length === qn || quietWorld.story.lastBigMoment !== quietWorld.time) {
  console.error('FAIL: anti-boring engine did not inject event');
  process.exit(1);
}
console.log('anti-boring injection OK');

let legendaryCount = 0;
for (let seed = 500; seed <= 509; seed++) {
  const wn = createWorld(seed);
  for (let i = 0; i < 60 * 3600; i++) stepWorld(wn, 1 / 60);
  for (const e of wn.news) {
    if (
      ['superpower-crisis', 'global-tension', 'transformation', 'new-era'].includes(e.kind)
    ) {
      legendaryCount++;
    }
  }
}
console.log(`natural census: legendary-tier events in 10 world-hours: ${legendaryCount}`);
if (legendaryCount > 15) {
  console.error('FAIL: legendary events too frequent');
  process.exit(1);
}

console.log('\nALL PHASE-3 CHECKS PASSED');
