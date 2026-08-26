import { CONFIG } from '../src/config';
import { createWorld, stepWorld } from '../src/sim/world';
import { createAdminServer } from '../src/admin/server';

const PORT = 3211;
const AUTH = 'Basic ' + Buffer.from(`${CONFIG.admin.auth.user}:${CONFIG.admin.auth.pass}`).toString('base64');

async function fetchJSON(path: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    ...options,
    headers: {
      'Authorization': AUTH,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> ?? {}),
    },
  });
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text) };
}

async function main(): Promise<void> {
  console.log('=== ADMIN API SMOKE TEST ===\n');

  const world = createWorld(20260825);
  const server = createAdminServer(world);

  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`admin server listening on :${PORT}`);

  console.log('\n--- auth test ---');
  const noAuth = await fetch(`http://localhost:${PORT}/api/state`);
  if (noAuth.status !== 401) {
    console.error(`FAIL: expected 401 without auth, got ${noAuth.status}`);
    process.exit(1);
  }
  console.log('  401 without auth ✓');

  console.log('\n--- GET /api/state ---');
  const state = await fetchJSON('/api/state') as { status: number; body: Record<string, unknown> };
  if (state.status !== 200) {
    console.error(`FAIL: expected 200, got ${state.status}`);
    process.exit(1);
  }
  const s = state.body as Record<string, unknown>;
  if (typeof s.world !== 'object' || !Array.isArray(s.countries) || !Array.isArray(s.wars) || !Array.isArray(s.recentEvents)) {
    console.error('FAIL: missing world/countries/wars/recentEvents in state');
    process.exit(1);
  }
  const w = s.world as Record<string, unknown>;
  console.log(`  seed=${w.seed} day=${w.day} time=${w.time} paused=${w.paused} speed=${w.speedMultiplier}`);
  console.log(`  countries=${(s.countries as unknown[]).length} wars=${(s.wars as unknown[]).length} events=${(s.recentEvents as unknown[]).length}`);
  if (typeof (s.stats as Record<string, unknown>).totalEvents !== 'number') {
    console.error('FAIL: stats.totalEvents missing');
    process.exit(1);
  }
  console.log('  state snapshot ✓');

  console.log('\n--- POST /api/control/pause ---');
  const pause1 = await fetchJSON('/api/control/pause', { method: 'POST' }) as { body: Record<string, unknown> };
  if (pause1.body.paused !== true) {
    console.error(`FAIL: expected paused=true, got ${pause1.body.paused}`);
    process.exit(1);
  }
  console.log('  paused=true ✓');

  stepWorld(world, 1 / 60);
  if (world.time !== 0) {
    console.error('FAIL: time advanced while paused');
    process.exit(1);
  }
  console.log('  step blocked while paused ✓');

  const pause2 = await fetchJSON('/api/control/pause', { method: 'POST' }) as { body: Record<string, unknown> };
  if (pause2.body.paused !== false) {
    console.error(`FAIL: expected paused=false, got ${pause2.body.paused}`);
    process.exit(1);
  }
  console.log('  unpaused ✓');

  console.log('\n--- POST /api/control/speed ---');
  const speed = await fetchJSON('/api/control/speed', { method: 'POST', body: JSON.stringify({ speed: 2.5 }) }) as { body: Record<string, unknown> };
  if (speed.body.speedMultiplier !== 2.5) {
    console.error(`FAIL: expected speed=2.5, got ${speed.body.speedMultiplier}`);
    process.exit(1);
  }
  console.log('  speed=2.5 ✓');

  const speedClamp = await fetchJSON('/api/control/speed', { method: 'POST', body: JSON.stringify({ speed: 10 }) }) as { body: Record<string, unknown> };
  if (speedClamp.body.speedMultiplier !== 4) {
    console.error(`FAIL: expected clamped speed=4, got ${speedClamp.body.speedMultiplier}`);
    process.exit(1);
  }
  console.log('  speed clamped to 4 ✓');

  const speedReset = await fetchJSON('/api/control/speed', { method: 'POST', body: JSON.stringify({ speed: 1 }) }) as { body: Record<string, unknown> };
  if (speedReset.body.speedMultiplier !== 1) {
    console.error(`FAIL: expected speed=1, got ${speedReset.body.speedMultiplier}`);
    process.exit(1);
  }
  console.log('  speed reset to 1 ✓');

  console.log('\n--- POST /api/control/war ---');
  const war = await fetchJSON('/api/control/war', { method: 'POST', body: JSON.stringify({ attacker: 'brazil', defender: 'argentina' }) }) as { body: Record<string, unknown> };
  if (war.body.success !== true && war.body.success !== false) {
    console.error('FAIL: war endpoint did not return success boolean');
    process.exit(1);
  }
  console.log(`  war declared: ${war.body.success} ✓`);

  console.log('\n--- POST /api/control/event ---');
  const event = await fetchJSON('/api/control/event', { method: 'POST', body: JSON.stringify({ tier: 'common' }) }) as { body: Record<string, unknown> };
  if (event.body.success !== true && event.body.success !== false) {
    console.error('FAIL: event endpoint did not return success boolean');
    process.exit(1);
  }
  console.log(`  event spawned: ${event.body.success} ✓`);

  console.log('\n--- POST /api/control/snapshot ---');
  const snap = await fetchJSON('/api/control/snapshot', { method: 'POST' }) as { body: Record<string, unknown> };
  if (typeof snap.body.path !== 'string') {
    console.error(`FAIL: expected snapshot path, got ${snap.body.path}`);
    process.exit(1);
  }
  console.log(`  snapshot saved: ${snap.body.path} ✓`);

  console.log('\n--- GET /api/snapshots ---');
  const snaps = await fetchJSON('/api/snapshots') as { body: Record<string, unknown> };
  if (!Array.isArray(snaps.body.snapshots)) {
    console.error('FAIL: snapshots endpoint did not return array');
    process.exit(1);
  }
  console.log(`  snapshots: ${(snaps.body.snapshots as string[]).length} files ✓`);

  console.log('\n--- POST /api/control/restore ---');
  const restore = await fetchJSON('/api/control/restore', { method: 'POST', body: JSON.stringify({ filepath: snap.body.path }) }) as { body: Record<string, unknown> };
  if (restore.body.success !== true) {
    console.error(`FAIL: restore failed: ${restore.body}`);
    process.exit(1);
  }
  console.log('  restored ✓');

  console.log('\n--- POST /api/control/country ---');
  const country = await fetchJSON('/api/control/country', { method: 'POST', body: JSON.stringify({ id: 'brazil', field: 'military', value: 100 }) }) as { body: Record<string, unknown> };
  if (country.body.success !== true) {
    console.error(`FAIL: country update failed: ${country.body}`);
    process.exit(1);
  }
  if (world.byId.get('brazil')!.military !== 100) {
    console.error('FAIL: country military not updated');
    process.exit(1);
  }
  console.log('  country military=100 ✓');

  console.log('\n--- dashboard HTML ---');
  const dashRes = await fetch(`http://localhost:${PORT}/admin`);
  if (dashRes.status !== 200 || !dashRes.headers.get('content-type')?.includes('text/html')) {
    console.error(`FAIL: dashboard not served as HTML, got status ${dashRes.status}`);
    process.exit(1);
  }
  const dashHtml = await dashRes.text();
  if (!dashHtml.includes('World Orbit Admin Dashboard')) {
    console.error('FAIL: dashboard HTML missing expected content');
    process.exit(1);
  }
  console.log('  dashboard served ✓');

  server.close();
  console.log('\n=== ALL ADMIN CHECKS PASSED ===');
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
