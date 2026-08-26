import { createWorld, stepWorld } from '../src/sim/world';
import { collectMetrics, computeDeltas, type SoakMetrics } from '../src/sim/metrics';
import { validateSoakTest, type SoakTestReport } from '../src/sim/validate';

interface MatrixConfig {
  seeds: number;
  simDays: number;
  speed: number;
}

function parseArgs(): MatrixConfig {
  const config: MatrixConfig = { seeds: 10, simDays: 7, speed: 100 };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seeds' || args[i] === '-n') config.seeds = parseInt(args[++i], 10);
    else if (args[i] === '--days' || args[i] === '-d') config.simDays = parseInt(args[++i], 10);
    else if (args[i] === '--speed' || args[i] === '-s') config.speed = parseInt(args[++i], 10);
    else if (args[i] === '--help') {
      console.log(`
World Orbit — Multi-Seed Test Matrix

Usage: npm run soak:matrix [options]

Options:
  --seeds, -n <n>   Number of seeds to test (default: 10)
  --days, -d <n>    Sim-days per seed (default: 7)
  --speed, -s <n>   Speed multiplier (default: 100)
  --help            Show this help
      `);
      process.exit(0);
    }
  }
  return config;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

interface SeedResult {
  seed: number;
  report: SoakTestReport;
  finalMetrics: SoakMetrics;
  durationMs: number;
}

async function runSeed(seed: number, simDays: number, speed: number): Promise<SeedResult> {
  const startTime = Date.now();
  const totalSimSeconds = simDays * 86400;
  const totalTicks = totalSimSeconds * 60;
  const logIntervalTicks = 3600 * 60;

  const world = createWorld(seed);
  const snapshots: import('../src/sim/metrics').HourlySnapshot[] = [];
  let prevMetrics = collectMetrics(world);
  let lastLogTick = 0;

  for (let tick = 0; tick <= totalTicks; tick++) {
    stepWorld(world, 1 / 60);

    if (tick - lastLogTick >= logIntervalTicks) {
      lastLogTick = tick;
      const metrics = collectMetrics(world);
      const deltas = computeDeltas(prevMetrics, metrics);
      snapshots.push({ hour: Math.floor(metrics.timestamp / 3600), metrics, deltas });
      prevMetrics = metrics;
    }
  }

  const finalMetrics = collectMetrics(world);
  const report = validateSoakTest(snapshots);

  return {
    seed,
    report,
    finalMetrics,
    durationMs: Date.now() - startTime,
  };
}

function printResult(result: SeedResult, index: number, total: number): void {
  const m = result.finalMetrics;
  const top3 = m.countries.sort((a, b) => b.power - a.power).slice(0, 3);
  const status = result.report.passed ? '✅' : '❌';

  console.log(
    `[${index + 1}/${total}] ${status} Seed ${result.seed} | ` +
    `Day ${m.day} | ` +
    `Wars ${m.activeWars} | ` +
    `Events ${m.totalEvents} | ` +
    `Leader: ${top3[0]?.id} (${top3[0]?.power.toFixed(1)}) | ` +
    `Tick: ${m.perf.avgTickMs.toFixed(1)}ms | ` +
    `Mem: ${m.perf.memoryMB.toFixed(0)}MB | ` +
    `Time: ${formatDuration(result.durationMs / 1000)}`
  );

  if (!result.report.passed) {
    for (const check of result.report.checks) {
      if (check.status === 'fail') console.log(`    ❌ ${check.message}`);
    }
  }
}

async function main(): Promise<void> {
  const config = parseArgs();
  const baseSeed = 20260825;

  console.log('=== WORLD ORBIT — MULTI-SEED TEST MATRIX ===');
  console.log(`Seeds: ${config.seeds} (from ${baseSeed})`);
  console.log(`Duration: ${config.simDays} sim-days per seed`);
  console.log(`Speed: ${config.speed}×`);
  console.log('');

  const results: SeedResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < config.seeds; i++) {
    const seed = baseSeed + i;
    process.stdout.write(`Running seed ${seed} (${i + 1}/${config.seeds})...`);
    const result = await runSeed(seed, config.simDays, config.speed);
    results.push(result);
    printResult(result, i, config.seeds);
  }

  const totalMs = Date.now() - startTime;
  const passed = results.filter((r) => r.report.passed).length;
  const failed = results.filter((r) => !r.report.passed).length;

  console.log('');
  console.log('=== SUMMARY ===');
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);
  console.log(`Total time: ${formatDuration(totalMs / 1000)}`);

  const allTop3Power = results.map((r) =>
    r.finalMetrics.countries.sort((a, b) => b.power - a.power).slice(0, 3).map((c) => c.id)
  );
  console.log('');
  console.log('Top-3 by seed:');
  for (let i = 0; i < results.length; i++) {
    console.log(`  Seed ${results[i].seed}: ${allTop3Power[i].join(', ')}`);
  }

  if (failed > 0) {
    console.log('\n❌ MATRIX FAILED — Some seeds failed validation.');
    process.exit(1);
  } else {
    console.log('\n✅ MATRIX PASSED — All seeds stable.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Matrix test failed:', err);
  process.exit(1);
});
