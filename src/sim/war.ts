import { CONFIG } from '../config';
import type { Rng } from '../core/rng';
import type { War, WarObjective, WorldState } from './types';
import { pairKey, flagEmoji } from './diplomacy';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const BATTLE_PLACES = [
  'RIVER GATE',
  'IRON RIDGE',
  'ASH PLAIN',
  'RED MESA',
  'STORM PASS',
  'BLACK REACH',
  'GOLD DELTA',
  'SILENT STEPPE',
  'CRIMSON STRAIT',
  'FROZEN HOLLOW',
  'DUNE WALL',
  'JADE VALLEY',
  'TWIN HARBOR',
  'BROKEN SPIRE',
  'EMBER COAST',
  'NORTH MOOR',
  'SALT FLATS',
  'HIGH BASTION',
];

const OBJECTIVES: WarObjective[] = [
  'territory',
  'resources',
  'strategic',
  'revenge',
  'regime-change',
];

export function activeWarPairs(w: WorldState): Set<string> {
  const set = new Set<string>();
  for (const war of w.wars.values()) {
    if (war.outcome) continue;
    set.add(pairKey(war.attackerId, war.defenderId));
  }
  return set;
}

export function warAt(w: WorldState, id: string): War | null {
  if (id === null) return null;
  for (const war of w.wars.values()) {
    if (war.outcome) continue;
    if (war.attackerId === id || war.defenderId === id) return war;
  }
  return null;
}

function pushNews(
  w: WorldState,
  kind: import('./types').EventKind,
  actorA: string,
  actorB: string,
  delta: number,
  headline: string,
): void {
  w.news.push({
    id: w.nextEventId++,
    time: w.time,
    day: w.day,
    kind,
    actorA,
    actorB,
    delta,
    headline,
  });
  if (w.news.length > CONFIG.diplomacy.newsCap) w.news.shift();
}

export function maybeDeclareWar(w: WorldState, rng: Rng): void {
  const W = CONFIG.war;

  let activeWars = 0;
  for (const war of w.wars.values()) {
    if (!war.outcome) activeWars++;
  }
  if (activeWars >= W.maxConcurrentWars) return;

  for (const rel of w.relations.values()) {
    const A = w.byId.get(rel.a)!;
    const B = w.byId.get(rel.b)!;
    const key = pairKey(rel.a, rel.b);

    if (rel.score > W.scoreThreshold || rel.tension < W.tensionThreshold) continue;
    if ((w.truces.get(key) ?? 0) > w.time) continue;
    if (warAt(w, A.def.id) || warAt(w, B.def.id)) continue;

    const drought = Math.max(0, w.time - Math.max(w.lastWarEnd, -W.droughtStartSec) - W.droughtStartSec);
    const droughtBonus = W.droughtMaxBonus * (1 - Math.exp(-drought / W.droughtStartSec));

    const strengthGap = (A.power - B.power) / 100;
    let chance =
      W.baseChance + droughtBonus + W.aggBias * ((A.p.aggression + B.p.aggression) / 2);
    chance += W.strengthBias * Math.abs(strengthGap);
    chance = clamp(chance, 0, 0.45);
    if (rng() >= chance) continue;

    const pAAttacks = clamp(
      0.5 +
        ((A.power * 0.35 + A.military * 0.45 + A.p.aggression * 20) -
          (B.power * 0.35 + B.military * 0.45 + B.p.aggression * 20)) /
          80,
      0.08,
      0.92,
    );
    const [attacker, defender] = rng() < pAAttacks ? [A, B] : [B, A];
    declareWar(w, attacker.def.id, defender.def.id, rng);
    return;
  }
}

export function declareWar(w: WorldState, attackerId: string, defenderId: string, rng: Rng): War {
  const A = w.byId.get(attackerId)!;
  const D = w.byId.get(defenderId)!;

  const war: War = {
    id: w.nextWarId++,
    attackerId,
    defenderId,
    objective: OBJECTIVES[Math.floor(rng() * OBJECTIVES.length)],
    startTime: w.time,
    startDay: w.day,
    momentum: 0,
    territory: 0,
    battles: [],
    intensity: clamp((A.military + D.military) / 120, 0.3, 1),
    outcome: null,
  };
  w.wars.set(war.id, war);
  A.warId = war.id;
  D.warId = war.id;

  const rel = w.relations.get(pairKey(attackerId, defenderId))!;
  rel.score = -100;
  rel.tension = 100;

  A.stability -= 4;
  D.stability -= 6;
  A.morale += 6;
  D.morale -= 8;
  A.publicSupport += 4;
  D.publicSupport -= 6;
  A.reputation -= 5;
  for (const c of [A, D]) c.exhaustion = Math.max(c.exhaustion, 10);

  const eA = flagEmoji(A.def.code);
  const eD = flagEmoji(D.def.code);
  pushNews(
    w,
    'war-declared',
    attackerId,
    defenderId,
    -100,
    `⚔️ WAR DECLARED — ${eA} ${A.def.name} · ${eD} ${D.def.name} (${war.objective.toUpperCase()})`,
  );
  return war;
}

function battleName(rng: Rng): string {
  return `BATTLE OF ${BATTLE_PLACES[Math.floor(rng() * BATTLE_PLACES.length)]}`;
}

function combatStrength(
  military: number,
  tech: number,
  morale: number,
  supply: number,
  rng: Rng,
): number {
  return (
    military *
    (0.75 + tech / 300) *
    (0.6 + morale / 125) *
    supply *
    (0.75 + rng() * 0.5)
  );
}

export function resolveBattles(w: WorldState, rng: Rng): void {
  const W = CONFIG.war;
  for (const war of w.wars.values()) {
    if (war.outcome) continue;
    if (rng() >= W.battleChance) continue;

    const A = w.byId.get(war.attackerId)!;
    const D = w.byId.get(war.defenderId)!;

    const atkPow = combatStrength(A.military, A.technology, A.morale, 1, rng);
    const defPow = combatStrength(D.military, D.technology, D.morale, W.homeAdvantage, rng);
    const pAtk = atkPow / (atkPow + defPow);
    const attackerWon = rng() < pAtk;

    const edge = Math.abs(pAtk - 0.5) * 2;
    let shift = (10 + 14 * edge) * (0.7 + rng() * 0.6);
    if (Math.sign(war.momentum) === (attackerWon ? 1 : -1)) shift *= 1.45;
    war.momentum = clamp(war.momentum + (attackerWon ? shift : -shift), -100, 100);

    const capture = 0.4 + rng() * 1.6;
    war.territory = clamp(war.territory + (attackerWon ? capture : -capture), -25, 25);
    war.battles.push({
      name: battleName(rng),
      day: w.day,
      attackerWon,
      momentumShift: attackerWon ? shift : -shift,
    });

    if (attackerWon) {
      D.military -= 2 + rng() * 3;
      A.military -= 1 + rng() * 2;
      D.morale -= 2.5 + rng() * 1.5;
      A.morale -= 1;
      D.stability -= 1.2;
      A.exhaustion += 3 + rng() * 3;
      D.exhaustion += 5 + rng() * 4;
    } else {
      A.military -= 2.5 + rng() * 3.5;
      D.military -= 1 + rng() * 2;
      A.morale -= 2.5 + rng() * 1.5;
      D.morale -= 1;
      A.stability -= 1.2;
      A.exhaustion += 5 + rng() * 4;
      D.exhaustion += 3 + rng() * 3;
    }
    for (const c of [A, D]) {
      c.military = clamp(c.military, 4, 100);
      c.gdp *= 1 - 0.0018 * war.intensity;
      c.exhaustion = clamp(c.exhaustion, 0, 100);
      c.stability = clamp(c.stability, 5, 98);
      c.morale = clamp(c.morale, 5, 98);
    }

    const winner = attackerWon ? A : D;
    const loser = attackerWon ? D : A;
    const verb = attackerWon ? 'breaks through' : 'holds the line';
    pushNews(
      w,
      'battle',
      A.def.id,
      D.def.id,
      attackerWon ? shift : -shift,
      `⚔️ ${war.battles[war.battles.length - 1].name} — ${flagEmoji(A.def.code)} ${A.def.name} vs ${flagEmoji(D.def.code)} ${D.def.name} · ${flagEmoji(winner.def.code)} ${winner.def.name} ${verb}`,
    );
    if (war.battles.length % 4 === 0) {
      pushNews(
        w,
        'battle',
        A.def.id,
        D.def.id,
        0,
        `📊 WAR UPDATE — ${flagEmoji(A.def.code)} ${A.def.name} ${(50 + war.momentum / 2).toFixed(0)}% · ${flagEmoji(D.def.code)} ${D.def.name} ${(50 - war.momentum / 2).toFixed(0)}% · ${war.territory >= 0 ? `${flagEmoji(A.def.code)}+${war.territory.toFixed(1)}%` : `${flagEmoji(D.def.code)}+${(-war.territory).toFixed(1)}%`}`,
      );
    }
  }
}

function endWar(w: WorldState, war: War, outcome: import('./types').WarOutcome, rng: Rng): void {
  war.outcome = outcome;
  const A = w.byId.get(war.attackerId)!;
  const D = w.byId.get(war.defenderId)!;
  const key = pairKey(war.attackerId, war.defenderId);

  A.warId = null;
  D.warId = null;
  w.truces.set(key, w.time + CONFIG.war.truceSec);
  w.lastWarEnd = w.time;

  const rel = w.relations.get(key)!;
  rel.score = -45;
  rel.tension = 30;

  const durMin = Math.round((w.time - war.startTime) / 60);
  const terrAbs = Math.abs(war.territory).toFixed(1);
  const eA = flagEmoji(A.def.code);
  const eD = flagEmoji(D.def.code);
  const vs = `${eA} ${A.def.name} · ${eD} ${D.def.name}`;

  if (outcome === 'white-peace') {
    for (const c of [A, D]) {
      c.stability -= 3;
      c.morale -= 4;
      c.reputation -= 1;
      c.exhaustion = Math.min(c.exhaustion, 55);
    }
    pushNews(
      w,
      'peace',
      A.def.id,
      D.def.id,
      0,
      `🕊 CEASEFIRE — ${vs} · ${durMin}min · ${war.battles.length} battles`,
    );
    return;
  }

  const winner = outcome === 'attacker' ? A : D;
  const loser = outcome === 'attacker' ? D : A;
  const eW = flagEmoji(winner.def.code);
  const eL = flagEmoji(loser.def.code);

  const gdpLoss = 2 + rng() * 3 + Number(terrAbs) * 0.4;
  loser.gdp *= 1 - gdpLoss / 100;
  loser.stability -= 7 + rng() * 4;
  loser.morale -= 10 + rng() * 6;
  loser.publicSupport -= 9 + rng() * 5;
  loser.influence -= 5 + rng() * 4;
  loser.reputation -= 4;
  loser.exhaustion = Math.min(loser.exhaustion, 70);
  loser.defeatUntil = w.time + 60;

  winner.influence += 5 + rng() * 4;
  winner.reputation += 3;
  winner.morale += 6;
  winner.gdp *= 1.015;
  winner.exhaustion = Math.min(winner.exhaustion, 60);

  for (const c of [A, D]) {
    c.stability = clamp(c.stability, 5, 98);
    c.morale = clamp(c.morale, 5, 98);
    c.publicSupport = clamp(c.publicSupport, 5, 98);
    c.influence = clamp(c.influence, 1, 100);
    c.reputation = clamp(c.reputation, -60, 60);
  }

  pushNews(
    w,
    'victory',
    winner.def.id,
    loser.def.id,
    40,
    `🏆 VICTORY — ${eW} ${winner.def.name} defeats ${eL} ${loser.def.name} · +${terrAbs}% territory · ${durMin}min · ${war.battles.length} battles`,
  );
}

export function checkPeace(w: WorldState, rng: Rng): void {
  const W = CONFIG.war;
  for (const war of [...w.wars.values()]) {
    if (war.outcome) continue;
    const duration = w.time - war.startTime;

    if (war.momentum >= W.momentumWin && war.battles.length >= W.minBattlesForDecision) {
      endWar(w, war, 'attacker', rng);
      continue;
    }
    if (war.momentum <= -W.momentumWin && war.battles.length >= W.minBattlesForDecision) {
      endWar(w, war, 'defender', rng);
      continue;
    }
    if (duration >= W.maxDurationSec) {
      endWar(w, war, 'white-peace', rng);
      continue;
    }
    if (war.battles.length >= W.minBattlesForDecision && Math.abs(war.momentum) < 20) {
      const A = w.byId.get(war.attackerId)!;
      const D = w.byId.get(war.defenderId)!;
      const bothWeary = A.exhaustion > 70 && D.exhaustion > 70;
      const ceasefireReady = duration >= 420 || war.battles.length >= 10;
      if (bothWeary || (ceasefireReady && rng() < W.ceasefireChance)) {
        endWar(w, war, 'white-peace', rng);
      }
    }
  }
}
