# WORLD ORBIT

A 24/7 autonomous geopolitical simulation rendered as a vertical-format (9:16) livestream, built with TypeScript, PixiJS v8, and Vite.

21 nations compete for orbital dominance through economic growth, diplomacy, military conflict, and narrative events — all running deterministically from a single seed, requiring zero human intervention.

## Quick Start

```bash
npm install
npm run dev        # http://localhost:5173
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server on :5173 |
| `npm run build` | Type-check + production build |
| `npm run admin` | Admin dashboard API on :3210 |
| `npm run soak` | Headless soak test (CLI flags below) |
| `npm run soak:24h` | 24-hour soak at 100x speed |
| `npm run soak:matrix` | Multi-seed regression matrix |

### Soak Test Flags

```
--hours 24          Duration in hours (default 24)
--speed 100         Simulation speed multiplier (default 100)
--log-interval 60   Seconds between metric logs
--seed 20260825     World seed
```

### Soak Matrix Flags

```
--seeds 42,1337,20260825   Comma-separated seeds
--days 3                   Simulated days per seed
--speed 100                Speed multiplier
```

## Keyboard Controls

| Key | Action |
|-----|--------|
| `H` | Hide/show HUD overlay |
| `D` | Debug panel |
| `G` | Orbital guides |
| `W` | Focus on active war |
| `R` | Reset camera |
| `P` | Start/stop recording |
| `M` | Toggle mute |
| `/` | Open command input |

## Architecture

```
src/
├── sim/                 # Core simulation
│   ├── world.ts         # World orchestrator
│   ├── types.ts         # All type definitions
│   ├── economy.ts       # GDP, military, tech, industry
│   ├── diplomacy.ts     # Trust, alliances, rivalries
│   ├── war.ts           # War lifecycle + battles
│   ├── story.ts         # Tiered event scheduler + retention
│   ├── director.ts      # Autonomous story director
│   ├── decision.ts      # Country AI decision engine
│   ├── snapshot.ts      # Save/load with checksums + rotation
│   ├── metrics.ts       # Soak test metrics
│   ├── validate.ts      # Soak test validator
│   └── replay.ts        # World replay from snapshots
│
├── render/              # PixiJS rendering
│   ├── compositor.ts    # HUD: flags, news ticker, war panel
│   ├── camera.ts        # Director camera with priority system
│   ├── audio.ts         # 12 sound kinds + adaptive drone
│   ├── stream.ts        # MediaRecorder output
│   └── predictionOverlay.ts  # Audience prediction countdown
│
├── broadcast/           # Phase 10: Autonomous broadcast
│   ├── controller.ts    # Broadcast state machine
│   ├── director.ts      # Programming Director
│   ├── pacing.ts        # Event cooldowns + tension rhythm
│   ├── viewerArrival.ts # "While You Were Away" system
│   ├── autoQueue.ts     # Auto highlight pipeline
│   ├── seasons.ts       # World seasons (8 × 500 days)
│   ├── chronicle.ts     # World history chronicle
│   ├── mythic.ts        # Legendary + Mythic events
│   └── emergency.ts     # Emergency controls + observability
│
├── audience/            # Phase 8: Spectator game
│   ├── citizen.ts       # XP, achievements, reputation
│   ├── prediction.ts    # Prediction lifecycle + voting
│   ├── voting.ts        # Collective voting + rate limiting
│   ├── leaderboard.ts   # Ranked seasons + 7-day cycles
│   ├── chatCommands.ts  # 10 chat commands
│   └── analytics.ts     # Engagement tracking
│
├── content/             # Phase 9: Viral content engine
│   ├── recorder.ts      # Event timeline recording
│   ├── highlightDetector.ts  # Best moment detection
│   ├── replay.ts        # Deterministic cinematic replay
│   ├── packaging.ts     # Title, hook, description, hashtags
│   ├── archive.ts       # Story archive + search
│   ├── queue.ts         # Content pipeline
│   ├── whatYouMissed.ts # Catch-up for returning viewers
│   └── analytics.ts     # Content performance metrics
│
├── monitoring/          # Phase 7: Health + balance
│   ├── health.ts        # System health checks
│   ├── storyQuality.ts  # Story quality scoring
│   ├── boredomAnalytics.ts  # Boredom detection
│   ├── antiRepetition.ts    # Duplicate prevention
│   ├── balance.ts       # Country + war balance monitors
│   └── watchdog.ts      # 4 watchdog subsystems
│
├── growth/              # Phase 10: Optimization
│   └── optimizer.ts     # Content learning engine
│
├── admin/               # Phase 5: Admin dashboard
│   ├── server.ts        # HTTP API + dashboard
│   └── main.ts          # Admin entry point
│
├── config.ts            # All simulation parameters
├── main.ts              # Browser entry point
└── style.css            # Minimal styles
```

## Simulation Details

### Countries (21)

Each country has unique personality (aggressive, cautious, diplomatic, unpredictable, expansionist, isolationist), economic traits, and power rankings.

**Tier 1** (Power 95–82): United States, China, Russia
**Tier 2** (Power 73–63): India, Japan, Germany, UK, France, Brazil, Iran
**Tier 3** (Power 55–45): South Korea, Australia, Canada, Turkey, Saudi Arabia, Indonesia
**Tier 4** (Power 40–30): Mexico, Nigeria, South Africa, Egypt, Argentina

### Deterministic Randomness

All randomness uses seeded `mulberry32` PRNG streams:

| Stream | Seed | Purpose |
|--------|------|---------|
| `bodiesRng` | `seed` | Orbital positions |
| `persRng` | `seed ^ 0x5f356495` | Personality traits |
| `relRng` | `seed ^ 0x1b873593` | Relations |
| `rngDiplo` | `seed ^ 0x9e3779b9` | Diplomacy |
| `rngEcon` | `seed ^ 0x2545f491` | Economy |
| `rngWar` | `seed ^ 0x85ebca6b` | War |
| `rngStory` | `seed ^ 0x27d4eb2f` | Stories |

Same seed = same world, always.

### Timing

- Render loop: rAF with accumulator, max 5 physics steps/frame
- `stepWorld(world, 1/60)` — fixed 60fps physics
- Economy tick: every 4 seconds
- Diplomacy tick: every 6 seconds
- Power recalculation: every 5 seconds
- War check: every 12 seconds
- Battle simulation: every 9 seconds
- One simulated day = 24 real seconds

### Economy

Additive growth formula: `gdp += growth * gdpGrowthBase - gdpDecayRate * gdp`

GDP ranges from ~11K to ~288K over 24 hours of simulation.

### War System

- Max 2 concurrent wars
- 900-second truce between wars
- Momentum win threshold: 72
- 2% ceasefire chance per battle
- Wartime economy adjustments

### Story Engine

- Rarity weights: common 70 / uncommon 20 / rare 8 / legendary 2
- Roll spacing: 30–90 seconds between checks
- Retention hooks: breathing room (60s), level 1 (60s), level 2 (120s), level 3 (200s)
- Crisis guaranteed after 480s of no events
- Diversity window: 20 events, max 3 same kind
- Mystery chains with multi-stage beats

## Broadcast System

### State Machine

```
BOOT → WORLD LOAD → HEALTH CHECK → BROADCAST START → RUNNING
                                                         ↕
                                                    DEGRADED
                                                         ↕
                                                    RECOVERY
```

### Programming Rhythm

```
CALM
 ↓
SMALL EVENT
 ↓
CALM
 ↓
TENSION BUILDS
 ↓
ANTICIPATION
 ↓
🔥 MAJOR EVENT
 ↓
CINEMATIC REVEAL
 ↓
AFTERMATH
 ↓
CALM
```

### Event Cooldowns

| Tier | Cooldown |
|------|----------|
| Common | None |
| Uncommon | None |
| Rare | 60 seconds |
| Legendary | 180 seconds |
| Mythic | 600 seconds |

### World Seasons

| Season | Name | Days |
|--------|------|------|
| 1 | The First Age | 1–500 |
| 2 | The Age of Alliances | 501–1000 |
| 3 | The Great Collapse | 1001–1500 |
| 4 | The Reformation | 1501–2000 |
| 5 | The Age of Shadows | 2001–2500 |
| 6 | The Golden Era | 2501–3000 |
| 7 | The Final War | 3001–3500 |
| 8 | The New World | 3501–4000 |

## Content Pipeline

```
STORY COMPLETES
     ↓
HIGHLIGHT DETECTOR (score ≥ 90)
     ↓
AUTO QUEUE
     ↓
┌─────────┬──────────┬───────────┬───────────┐
│ Replay  │  Short   │ Thumbnail │ Packaging │
│ 3-10min │ 15-60s   │ 9:16      │ Title+Hook│
└─────────┴──────────┴───────────┴───────────┘
     ↓
READY FOR REVIEW
     ↓
RENDER → EXPORT
```

### Content Analytics

Tracks: event type, hook type, story score, replay length, prediction participation, viewer engagement.

Generates recommendations with confidence scores.

## Audience System

### Citizen Profiles

- 100-level XP system (exponential: `100 × 1.15^level`)
- 20 achievements (bronze/silver/gold/legendary)
- Reputation: predictionSkill + attendance + consistency + community
- Influence budget: 100/day

### Chat Commands

| Command | Description |
|---------|-------------|
| `!help` | List all commands |
| `!predict` | Create vote |
| `!country` | Country info |
| `!war` | War status |
| `!leaderboard` | Top citizens |
| `!world` | World overview |
| `!stats` | Simulation stats |
| `!profile` | Your profile |
| `!vote` | Cast vote |

### Predictions

- Open → Locked → Resolved/Expired lifecycle
- Correct prediction: 50 XP
- Incorrect: 10 XP
- Streak tracking

## Monitoring

### Health Checks

Every 300 frames: FPS, memory, tick latency, story engine load.

### Story Quality

Scores: 0–100 based on tension, actor count, tier, drama factors.

### Boredom Analytics

Tracks: event kind distribution, tension accumulator, hook activation.

### Anti-Repetition

Detects: duplicate events, kind clustering, headline similarity.

### Balance Monitors

- **Country Balance**: Gini coefficient, runaway detection
- **War Balance**: Exhaustion, endless war detection, ceasefire triggers

### Watchdogs

Event, story, camera, broadcast — each monitors their subsystem for anomalies.

## Admin Dashboard

```bash
npm run admin    # http://localhost:3210
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Dashboard HTML |
| `/api/state` | GET | Full world state |
| `/api/health` | GET | System health |
| `/api/audience/stats` | GET | Audience metrics |
| `/api/audience/leaderboard` | GET | Top citizens |
| `/api/audience/predictions` | GET | Active predictions |
| `/api/content/archive` | GET | Story archive |
| `/api/content/featured` | GET | Featured stories |
| `/api/content/queue` | GET | Content queue stats |
| `/api/content/analytics` | GET | Content metrics |
| `/api/war` | POST | Start war |
| `/api/story` | POST | Spawn story event |
| `/api/pause` | POST | Pause/unpause |
| `/api/speed` | POST | Set speed (0.25–4×) |
| `/api/snapshot` | POST | Save snapshot |
| `/api/reload` | POST | Load latest snapshot |

### Dashboard Tabs

1. **Overview** — World state, GDP, power, active wars
2. **Health** — System metrics, FPS, memory
3. **Stories** — Event quality, recent events
4. **Balance** — Country Gini, war exhaustion
5. **Events** — Event history, kind distribution

## Build & Verification

```bash
# Type-check
npx tsc --noEmit

# Smoke test (3 parts: natural run, forced war, story engine)
npx tsx scripts/smoke.ts

# Production build
npx vite build

# Full verification
npm run build    # = tsc --noEmit && vite build
```

## Project Stats

| Metric | Value |
|--------|-------|
| TypeScript files | 65 |
| Source modules | 13 directories |
| Simulation countries | 21 |
| Story event types | 17+ |
| Chat commands | 10 |
| Achievement types | 20 |
| World seasons | 8 |
| Mythic templates | 5 |
| Legendary templates | 8 |
| Admin endpoints | 16 |
| Bundle size | ~430 KB |

## Tech Stack

- **Runtime**: Node.js v20+
- **Language**: TypeScript 5.6 (strict)
- **Bundler**: Vite 6.3
- **Renderer**: PixiJS 8.6 (WebGL/WebGPU)
- **Dev Tools**: tsx 4.19
- **Testing**: Custom smoke + soak scripts
- **No framework** — vanilla TypeScript + PixiJS

## Design Principles

1. **Deterministic** — Same seed = same world, always
2. **Autonomous** — Runs 24/7 without human intervention
3. **Narrative-driven** — Events create stories, not just data
4. **Audience-first** — Built for spectators, not operators
5. **Paced** — Calm is intentional, contrast makes moments matter
6. **Observable** — Every subsystem has health checks and metrics
7. **Recoverable** — Automatic recovery from 7 failure types
8. **Persistent** — World history, seasons, and citizen profiles survive restarts

## License

Private — All rights reserved.
