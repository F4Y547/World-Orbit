import type { HourlySnapshot, SoakMetrics } from './metrics';

export interface SoakTestReport {
  passed: boolean;
  failed: number;
  warnings: number;
  summary: string;
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
  }>;
}

function checkMetricHistory(snapshots: HourlySnapshot[], field: string, min: number, max: number, label: string): { name: string; status: 'pass' | 'fail' | 'warn'; message: string } {
  const values = snapshots.map((s) => {
    const m = s.metrics;
    if (field === 'activeWars') return m.activeWars;
    if (field === 'totalEvents') return m.totalEvents;
    if (field === 'avgTickMs') return m.perf.avgTickMs;
    if (field === 'memoryMB') return m.perf.memoryMB;
    return 0;
  });

  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);

  if (maxVal > max) {
    return { name: label, status: 'fail', message: `${label} exceeded max: ${maxVal.toFixed(1)} > ${max}` };
  }
  if (minVal < min) {
    return { name: label, status: 'fail', message: `${label} below min: ${minVal.toFixed(1)} < ${min}` };
  }
  return { name: label, status: 'pass', message: `${label} OK (${minVal.toFixed(1)} - ${maxVal.toFixed(1)})` };
}

function checkStability(snapshots: HourlySnapshot[]): { name: string; status: 'pass' | 'fail' | 'warn'; message: string } {
  if (snapshots.length < 2) return { name: 'Stability', status: 'pass', message: 'Not enough data' };

  const recent = snapshots.slice(-5);
  const powers = recent.map((s) =>
    s.metrics.countries.reduce((sum, c) => sum + c.power, 0)
  );

  const maxDelta = Math.max(...powers) - Math.min(...powers);
  if (maxDelta > 200) {
    return { name: 'Stability', status: 'fail', message: `Extreme power fluctuation: ${maxDelta.toFixed(1)}` };
  }
  return { name: 'Stability', status: 'pass', message: `Power stable (delta: ${maxDelta.toFixed(1)})` };
}

function checkEventRate(snapshots: HourlySnapshot[]): { name: string; status: 'pass' | 'fail' | 'warn'; message: string } {
  if (snapshots.length < 2) return { name: 'Event Rate', status: 'pass', message: 'Not enough data' };

  const events = snapshots.map((s) => s.metrics.totalEvents);
  const deltas = [];
  for (let i = 1; i < events.length; i++) deltas.push(events[i] - events[i - 1]);
  const avgDelta = deltas.reduce((s, d) => s + d, 0) / Math.max(1, deltas.length);

  if (avgDelta < 0.5) {
    return { name: 'Event Rate', status: 'warn', message: `Low event rate: ${avgDelta.toFixed(2)}/interval` };
  }
  return { name: 'Event Rate', status: 'pass', message: `Event rate OK: ${avgDelta.toFixed(2)}/interval` };
}

function checkMemory(snapshots: HourlySnapshot[]): { name: string; status: 'pass' | 'fail' | 'warn'; message: string } {
  const memValues = snapshots.map((s) => s.metrics.perf.memoryMB).filter((m) => m > 0);
  if (memValues.length === 0) return { name: 'Memory', status: 'pass', message: 'No memory data (browser?)' };

  const peak = Math.max(...memValues);
  if (peak > 200) {
    return { name: 'Memory', status: 'fail', message: `Memory leak suspected: peak ${peak.toFixed(1)}MB` };
  }
  if (peak > 100) {
    return { name: 'Memory', status: 'warn', message: `High memory usage: peak ${peak.toFixed(1)}MB` };
  }
  return { name: 'Memory', status: 'pass', message: `Memory OK: peak ${peak.toFixed(1)}MB` };
}

function checkNoCrashes(snapshots: HourlySnapshot[]): { name: string; status: 'pass' | 'fail' | 'warn'; message: string } {
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    if (curr.metrics.simTime <= prev.metrics.simTime && curr.metrics.day <= prev.metrics.day) {
      return { name: 'No Crashes', status: 'fail', message: `Simulation stalled at snapshot ${i}` };
    }
  }
  return { name: 'No Crashes', status: 'pass', message: 'No crashes detected' };
}

export function validateSoakTest(snapshots: HourlySnapshot[]): SoakTestReport {
  const checks: SoakTestReport['checks'] = [];

  checks.push(checkMetricHistory(snapshots, 'activeWars', 0, 5, 'Active Wars'));
  checks.push(checkMetricHistory(snapshots, 'avgTickMs', 0, 50, 'Tick Duration'));
  checks.push(checkMetricHistory(snapshots, 'memoryMB', 0, 200, 'Memory Usage'));
  checks.push(checkStability(snapshots));
  checks.push(checkEventRate(snapshots));
  checks.push(checkMemory(snapshots));
  checks.push(checkNoCrashes(snapshots));

  const failed = checks.filter((c) => c.status === 'fail').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;
  const passed = checks.filter((c) => c.status === 'pass').length;

  const summaryLines = [
    `Soak Test Report (${snapshots.length} snapshots)`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `✅ Passed: ${passed}`,
    `⚠️  Warnings: ${warnings}`,
    `❌ Failed: ${failed}`,
    ``,
    ...checks.map((c) => `  ${c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️' : '❌'} ${c.name}: ${c.message}`),
  ];

  if (snapshots.length > 0) {
    const last = snapshots[snapshots.length - 1].metrics;
    const first = snapshots[0].metrics;
    const totalEvents = last.totalEvents - first.totalEvents;
    const simHours = (last.simTime - first.simTime) / 3600;
    summaryLines.push(
      ``,
      `Simulation Summary:`,
      `  Duration: ${simHours.toFixed(1)} sim-hours (${last.day} days)`,
      `  Total events: ${totalEvents}`,
      `  Events/hour: ${(totalEvents / Math.max(0.1, simHours)).toFixed(1)}`,
      `  Peak tick: ${last.perf.maxTickMs.toFixed(2)}ms`,
    );
  }

  return {
    passed: failed === 0,
    failed,
    warnings,
    summary: summaryLines.join('\n'),
    checks,
  };
}
