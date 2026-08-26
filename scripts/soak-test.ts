import { createWorld, stepWorld } from '../src/sim/world';
import { collectMetrics, computeDeltas, type HourlySnapshot } from '../src/sim/metrics';
import { validateSoakTest, type SoakTestReport } from '../src/sim/validate';

interface SoakTestConfig {
  durationHours: number;
  speedMultiplier: number;
  logIntervalMinutes: number;
  seed: number;
}

const DEFAULT_CONFIG: SoakTestConfig = {
  durationHours: parseInt(process.env.SOAK_HOURS ?? '1', 10),
  speedMultiplier: parseInt(process.env.SOAK_SPEED ?? '100', 10),
  logIntervalMinutes: parseInt(process.env.SOAK_LOG_INTERVAL ?? '5', 10),
  seed: parseInt(process.env.SOAK_SEED ?? '20260825', 10),
};

function parseArgs(): SoakTestConfig {
  const config = { ...DEFAULT_CONFIG };
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--hours' || arg === '-h') {
      config.durationHours = parseInt(args[++i], 10);
    } else if (arg === '--speed' || arg === '-s') {
      config.speedMultiplier = parseInt(args[++i], 10);
    } else if (arg === '--log-interval' || arg === '-l') {
      config.logIntervalMinutes = parseInt(args[++i], 10);
    } else if (arg === '--seed') {
      config.seed = parseInt(args[++i], 10);
    } else if (arg === '--help') {
      console.log(`
World Orbit — 24-Hour Soak Test

Usage: npm run soak [options]

Options:
  --hours, -h <n>      Duration in hours (default: 1, env: SOAK_HOURS)
  --speed, -s <n>      Speed multiplier (default: 100, env: SOAK_SPEED)
  --log-interval, -l <n>  Log interval in minutes (default: 5, env: SOAK_LOG_INTERVAL)
  --seed <n>           World seed (default: 20260825, env: SOAK_SEED)
  --help               Show this help

Environment Variables:
  SOAK_HOURS           Duration in hours
  SOAK_SPEED           Speed multiplier
  SOAK_LOG_INTERVAL    Log interval in minutes
  SOAK_SEED            World seed

Examples:
  npm run soak                          # 1-hour test at 100× speed
  npm run soak -- --hours 24            # 24-hour test at 100× speed
  npm run soak -- --hours 24 --speed 200  # 24-hour test at 200× speed
  SOAK_HOURS=24 npm run soak            # 24-hour test via env var
      `);
      process.exit(0);
    }
  }

  return config;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function printProgress(hour: number, totalHours: number, snapshot: HourlySnapshot, elapsedMs: number): void {
  const m = snapshot.metrics;
  const d = snapshot.deltas;
  const progress = ((hour / totalHours) * 100).toFixed(1);
  const elapsed = formatDuration(elapsedMs / 1000);
  const eta = elapsedMs > 0 ? formatDuration((elapsedMs / hour) * (totalHours - hour)) : '?';

  const top5 = m.countries.sort((a, b) => b.power - a.power).slice(0, 5);
  const leader = top5[0];

  console.log(
    `[${progress}%] Hour ${hour}/${totalHours} | ` +
    `Day ${m.day} | ` +
    `War: ${m.activeWars} | ` +
    `Events: ${d.storyEvents} | ` +
    `Leader: ${leader?.id ?? '?'} (${leader?.power.toFixed(1) ?? '?'}) | ` +
    `GDP: ${m.countries.reduce((s, c) => s + c.gdp, 0).toFixed(0)} | ` +
    `Mem: ${m.perf.memoryMB.toFixed(1)}MB | ` +
    `Tick: ${m.perf.avgTickMs.toFixed(2)}ms | ` +
    `ETA: ${eta}`
  );
}

async function main(): Promise<void> {
  const config = parseArgs();
  const totalSimSeconds = config.durationHours * 3600;
  const ticksPerSimSecond = 60;
  const totalTicks = totalSimSeconds * ticksPerSimSecond;
  const logIntervalTicks = config.logIntervalMinutes * 60 * ticksPerSimSecond;

  console.log('=== WORLD ORBIT — SOAK TEST ===');
  console.log(`Seed: ${config.seed}`);
  console.log(`Duration: ${config.durationHours} hours (${totalSimSeconds} sim seconds)`);
  console.log(`Speed: ${config.speedMultiplier}×`);
  console.log(`Log interval: every ${config.logIntervalMinutes} minutes`);
  console.log(`Total ticks: ${totalTicks.toLocaleString()}`);
  console.log(`Estimated real time: ${formatDuration(totalTicks / (config.speedMultiplier * 60 * 60))}`);
  console.log('');

  const startTime = Date.now();
  const world = createWorld(config.seed);
  const snapshots: HourlySnapshot[] = [];
  let prevMetrics = collectMetrics(world);

  console.log('Starting simulation...\n');

  let lastLogTick = 0;
  for (let tick = 0; tick <= totalTicks; tick++) {
    stepWorld(world, 1 / 60);

    if (tick - lastLogTick >= logIntervalTicks) {
      lastLogTick = tick;
      const metrics = collectMetrics(world);
      const deltas = computeDeltas(prevMetrics, metrics);
      const hour = Math.floor(metrics.timestamp / 3600);

      snapshots.push({ hour, metrics, deltas });
      printProgress(hour, config.durationHours, { hour, metrics, deltas }, Date.now() - startTime);

      prevMetrics = metrics;
    }
  }

  const finalMetrics = collectMetrics(world);
  const finalDeltas = computeDeltas(prevMetrics, finalMetrics);
  const finalHour = Math.floor(finalMetrics.timestamp / 3600);

  if (snapshots.length === 0 || snapshots[snapshots.length - 1].hour !== finalHour) {
    snapshots.push({ hour: finalHour, metrics: finalMetrics, deltas: finalDeltas });
  }

  console.log('\n--- Simulation complete. Validating... ---\n');

  const report = validateSoakTest(snapshots);
  console.log(report.summary);

  const totalTimeMs = Date.now() - startTime;
  console.log(`\nReal time elapsed: ${formatDuration(totalTimeMs / 1000)}`);
  console.log(`Sim speed achieved: ${(totalSimSeconds / (totalTimeMs / 1000)).toFixed(1)}× real-time`);

  if (report.failed > 0) {
    console.log('\n❌ SOAK TEST FAILED — Critical issues found.');
    process.exit(1);
  } else if (report.warnings > 0) {
    console.log('\n⚠️ SOAK TEST PASSED WITH WARNINGS — Review recommended.');
    process.exit(0);
  } else {
    console.log('\n✅ SOAK TEST PASSED — Simulation stable for production.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Soak test failed:', err);
  process.exit(1);
});
