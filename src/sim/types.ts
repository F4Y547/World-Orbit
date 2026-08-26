import type { Rng } from '../core/rng';

export type MovementState = 'normal' | 'tension' | 'crisis' | 'war' | 'defeat';

export const STATE_SPEED_MUL: Record<MovementState, number> = {
  normal: 1,
  tension: 1.35,
  crisis: 1.6,
  war: 1.9,
  defeat: 0.45,
};

export type PersonalityType =
  | 'aggressive'
  | 'defensive'
  | 'diplomatic'
  | 'opportunistic'
  | 'unpredictable';

export type ResourceKey = 'energy' | 'food' | 'metals' | 'minerals' | 'technology' | 'strategic';

export interface CountryDef {
  id: string;
  name: string;
  code: string;
  accent: number;
  tier: number;
  power: number;
  population: number;
  resources: Record<ResourceKey, number>;
}

export interface Personality {
  type: PersonalityType;
  aggression: number;
  riskTolerance: number;
  techFocus: number;
}

export interface CountryRuntime {
  def: CountryDef;
  p: Personality;
  gdp: number;
  wealth: number;
  debt: number;
  economy: number;
  military: number;
  technology: number;
  industry: number;
  stability: number;
  morale: number;
  publicSupport: number;
  influence: number;
  reputation: number;
  population: number;
  resourcesScore: number;
  power: number;
  prevPower: number;
  ringTarget: number;
  lastRingChange: number;
  growthSmoothed: number;
  warId: number | null;
  exhaustion: number;
  defeatUntil: number;
}

export type RelationKind = 'allied' | 'friendly' | 'neutral' | 'competitive' | 'hostile' | 'war';

export function relationKind(score: number): RelationKind {
  if (score <= -55) return 'hostile';
  if (score <= -18) return 'competitive';
  if (score < 25) return 'neutral';
  return 'friendly';
}

export interface Relation {
  a: string;
  b: string;
  score: number;
  tension: number;
  trust: number;
  tradeVolume: number;
  militaryPressure: number;
  lastEventTime: number;
  eventMemory: EventMemory[];
}

export interface EventMemory {
  kind: EventKind;
  actorA: string;
  actorB: string;
  delta: number;
  time: number;
}

export type TensionLevel =
  | 'stable'
  | 'tension'
  | 'buildup'
  | 'crisis'
  | 'imminent'
  | 'collision';

export const TENSION_THRESHOLDS: Record<TensionLevel, [number, number]> = {
  stable: [0, 29],
  tension: [30, 49],
  buildup: [50, 69],
  crisis: [70, 84],
  imminent: [85, 94],
  collision: [95, 100],
};

export function tensionLevel(tension: number): TensionLevel {
  if (tension >= 95) return 'collision';
  if (tension >= 85) return 'imminent';
  if (tension >= 70) return 'crisis';
  if (tension >= 50) return 'buildup';
  if (tension >= 30) return 'tension';
  return 'stable';
}

export type CountryAction =
  | 'observe'
  | 'trade'
  | 'negotiate'
  | 'ally'
  | 'build-military'
  | 'threaten'
  | 'sanction'
  | 'expand'
  | 'retreat'
  | 'declare-war'
  | 'offer-peace';

export interface DecisionContext {
  self: CountryRuntime;
  relations: Map<string, Relation>;
  wars: War[];
  world: WorldState;
  rng: Rng;
}

export type EventKind =
  | 'trade-deal'
  | 'trade-mission'
  | 'cultural-exchange'
  | 'joint-exercise'
  | 'treaty'
  | 'sanctions'
  | 'border-dispute'
  | 'failed-talks'
  | 'rhetoric'
  | 'summit'
  | 'war-declared'
  | 'battle'
  | 'victory'
  | 'peace'
  | 'boom'
  | 'election'
  | 'breakthrough'
  | 'economic-crisis'
  | 'rebellion'
  | 'leadership-change'
  | 'alliance-form'
  | 'massive-alliance'
  | 'betrayal'
  | 'superpower-crisis'
  | 'global-tension'
  | 'transformation'
  | 'new-era'
  | 'mystery'
  | 'mystery-resolve'
  | 'resource-discovery'
  | 'demand-access'
  | 'refusal'
  | 'buildup'
  | 'summit-proposal';

export interface SimEvent {
  id: number;
  time: number;
  day: number;
  kind: EventKind;
  actorA: string;
  actorB: string;
  delta: number;
  headline: string;
  spectacle?: Spectacle;
}

export type WarObjective =
  | 'territory'
  | 'resources'
  | 'strategic'
  | 'revenge'
  | 'regime-change'
  | 'defense';

export type WarOutcome = 'attacker' | 'defender' | 'white-peace';

export interface BattleRecord {
  name: string;
  day: number;
  attackerWon: boolean;
  momentumShift: number;
}

export interface War {
  id: number;
  attackerId: string;
  defenderId: string;
  objective: WarObjective;
  startTime: number;
  startDay: number;
  momentum: number;
  territory: number;
  battles: BattleRecord[];
  intensity: number;
  outcome: WarOutcome | null;
}

export interface OrbitBody {
  def: CountryDef;
  ring: number;
  startTier: number;
  tierTarget: number;
  sizeRatio: number;
  state: MovementState;
  angle: number;
  dir: 1 | -1;
  omega: number;
  baseRadius: number;
  radius: number;
  radialVel: number;
  bobPhase: number;
  bobFreq: number;
  bobAmp: number;
  driftF: [number, number];
  driftP: [number, number];
  wanderF: [number, number];
  wanderP: [number, number];
  x: number;
  y: number;
  depth: number;
  scale: number;
}

export type StoryTier = 'common' | 'uncommon' | 'rare' | 'legendary';

export type SpectacleMood = 'calm' | 'tense' | 'dramatic' | 'triumphant' | 'ominous';
export type SpectacleVisual = 'none' | 'flash' | 'pulse' | 'ripple' | 'glitch';
export type HookType = 'unusual-activity' | 'rumor' | 'buildup' | 'mystery-signal';

export interface Spectacle {
  intensity: number;
  mood: SpectacleMood;
  tier: StoryTier;
  visual: SpectacleVisual;
}

export interface BoredomState {
  recentKinds: EventKind[];
  tensionAccumulator: number;
  hookActive: boolean;
  hookType: HookType | null;
  hookStartTime: number;
  hookLevel: number;
  lastHookTime: number;
}

export interface ActiveSequence {
  id: number;
  label: string;
  steps: Array<{ at: number; run: (w: WorldState, rng: Rng) => void }>;
  idx: number;
  countdownEnd: number | null;
}

export interface StoryState {
  nextRollAt: number;
  lastFire: Record<StoryTier, number>;
  lastLegendary: number;
  lastBigMoment: number;
  chains: ActiveSequence[];
  mysteries: ActiveSequence[];
  nextSeqId: number;
  boredom: BoredomState;
}

export type SituationPhase =
  | 'created'
  | 'anticipation'
  | 'escalation'
  | 'reveal'
  | 'resolution'
  | 'consequences';

export interface Situation {
  id: number;
  label: string;
  actors: string[];
  phase: SituationPhase;
  tension: number;
  interest: number;
  escalation: number;
  startTime: number;
  lastPhaseChange: number;
  events: SimEvent[];
}

export interface StoryDirectorState {
  situations: Situation[];
  nextSituationId: number;
  lastDirectorTick: number;
  focusSituationId: number | null;
}

export interface PerfState {
  tickCount: number;
  lastTickTime: number;
  avgTickMs: number;
  maxTickMs: number;
  memoryUsage: { heapUsed: number; heapTotal: number; rss: number };
}

export interface MonitoringState {
  lastHealthCheck: number;
  lastSnapshotHourly: number;
  lastSnapshotDaily: number;
  watchdogAlerts: Array<{ source: string; severity: string; message: string; time: number }>;
}

export interface AudienceState {
  activePredictionId: string | null;
  activeVoteId: string | null;
  lastPredictionTime: number;
  lastVoteTime: number;
  lastPredictionEventKind: string | null;
  viewerCount: number;
  totalPredictionsAllTime: number;
  totalVotesAllTime: number;
}

export interface ContentState {
  activeStoryId: string | null;
  lastRecordingStartTime: number;
  lastHighlightScore: number;
  totalStoriesRecorded: number;
  totalHighlightsDetected: number;
}

export interface WorldState {
  seed: number;
  time: number;
  day: number;
  paused: boolean;
  speedMultiplier: number;
  bodies: OrbitBody[];
  countries: CountryRuntime[];
  byId: Map<string, CountryRuntime>;
  relations: Map<string, Relation>;
  news: SimEvent[];
  nextEventId: number;
  wars: Map<number, War>;
  nextWarId: number;
  truces: Map<string, number>;
  lastWarEnd: number;
  econAcc: number;
  diploAcc: number;
  powerAcc: number;
  warAcc: number;
  battleAcc: number;
  rngDiplo: () => number;
  rngEcon: () => number;
  rngWar: () => number;
  rngStory: () => number;
  story: StoryState;
  director: StoryDirectorState;
  perf: PerfState;
  monitoring: MonitoringState;
  audience: AudienceState;
  content: ContentState;
}
