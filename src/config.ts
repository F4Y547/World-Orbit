const nodeEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

export const CONFIG = {
  seed: 20260825,
  width: 1080,
  height: 1920,
  centerX: 540,
  centerY: 930,
  tilt: 0.42,

  simStep: 1 / 60,
  dayLengthSec: 24,

  econIntervalSec: 4,
  diploIntervalSec: 6,
  powerIntervalSec: 5,

  earth: {
    radius: 182,
    rotationSpeed: 7,
    cloudSpeed: 11,
  },

  rings: [
    { radius: 298, speed: 0.3, bounceK: 2.4 },
    { radius: 398, speed: 0.225, bounceK: 2.0 },
    { radius: 488, speed: 0.165, bounceK: 1.7 },
  ],

  ringCooldownSec: 25,

  flagWidths: [92, 76, 62],

  physics: {
    radialDamping: 1.8,
    radiusWander: 11,
    maxRadiusDeviation: 44,
    bobAmpMin: 4,
    bobAmpMax: 10,
    sameRingSepAngle: 0.16,
    sameRingPush: 0.5,
    screenRepulseDist: 86,
    crossPush: 26,
    warPull: 26,
    trailPoints: 18,
    trailSampleEvery: 2,
  },

  powerWeights: {
    military: 0.26,
    economy: 0.22,
    technology: 0.14,
    population: 0.12,
    stability: 0.08,
    resources: 0.1,
    diplomacy: 0.08,
  },

  economy: {
    baseGrowth: 0.0022,
    growthNoise: 0.0012,
    friendlyTradeBonus: 0.0007,
    hostileTradePenalty: 0.0009,
    tradePartnerCap: 5,
    convergencePull: 0.0001,
    taxRate: 0.16,
    militaryUpkeepRate: 0.02,
    debtInterest: 0.01,
    debtGrowthDrag: 0.004,
    economyExponent: 0.90,
    gdpDecayRate: 0.0001,
    gdpGrowthBase: 2000,
  },

  military: {
    approachUp: 0.9,
    approachDown: 1.4,
    threatWeight: 0.22,
  },

  diplomacy: {
    decayToNeutral: 0.004,
    personalityAggDrift: 0.09,
    diplomaticWarmth: 0.06,
    hegemonyPull: 0.03,
    hegemonyMinGap: 20,
    hegemonyMinInfluence: 60,
    noiseAmp: 0.5,
    tensionRise: 0.002,
    tensionNoise: 0.05,
    tensionDecay: 0.15,
    eventChance: 0.55,
    newsCap: 60,
  },

  war: {
    checkIntervalSec: 12,
    maxConcurrentWars: 2,
    tensionThreshold: 70,
    scoreThreshold: -50,
    baseChance: 0.07,
    aggBias: 0.06,
    strengthBias: 0.05,
    droughtStartSec: 2400,
    droughtMaxBonus: 0.08,
    truceSec: 900,
    growthDrag: 0.0022,
    upkeepMul: 1.7,
    maxDurationSec: 900,
    battleIntervalSec: 9,
    battleChance: 0.5,
    homeAdvantage: 1.08,
    momentumWin: 72,
    minBattlesForDecision: 4,
    ceasefireChance: 0.02,
  },

  story: {
    rollSpacingSec: [30, 90] as const,
    weights: { common: 70, uncommon: 20, rare: 8, legendary: 2 },
    tierMinGapSec: { common: 20, uncommon: 120, rare: 600, legendary: 21600 },
    boredAfterSec: 150,
    deepBoredAfterSec: 330,
  },

  spectacle: {
    tierIntensity: { common: 0.2, uncommon: 0.5, rare: 0.8, legendary: 1.0 },
    announceDuration: { common: 4, uncommon: 5, rare: 7, legendary: 10 },
  },

  retention: {
    breatheSec: 60,
    hookLevel1Sec: 60,
    hookLevel2Sec: 120,
    hookLevel3Sec: 200,
    crisisAfterSec: 480,
    diversityWindow: 20,
    maxSameKind: 3,
    hookCooldownSec: 90,
  },

  camera: {
    transitionLerp: 0.018,
    eventZoom: 1.6,
    warZoomBase: 1.4,
    warZoomClose: 2.0,
    dramaticZoomSpeed: 0.035,
    idleDriftSec: [8, 20] as const,
    warFocusSec: [15, 35] as const,
  },

  monitoring: {
    healthCheckInterval: 60,
    metricsHistorySize: 3600,
    watchdogEventStaleSec: 300,
    watchdogStoryStaleSec: 1800,
    watchdogCameraStaleSec: 120,
    watchdogLowFpsFrames: 300,
    maxWarDurationSec: 600,
    snapshotHourlyInterval: 3600,
    snapshotDailyInterval: 86400,
    soakDefaultHours: 24,
    soakDefaultSpeed: 100,
    soakLogInterval: 60,
  },

  admin: {
    port: 3210,
    enabled: true,
    auth: {
      user: nodeEnv?.ADMIN_USER ?? 'admin',
      pass: nodeEnv?.ADMIN_PASS ?? 'orbit2026',
    },
    corsOrigins: ['http://localhost:5173'],
  },
} as const;
