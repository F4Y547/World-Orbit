import { CONFIG } from '../config';
import { createWorld } from '../sim/world';
import { createAdminServer } from './server';

const world = createWorld(CONFIG.seed);
const server = createAdminServer(world);

if (!process.env.ADMIN_PASS) {
  console.warn('WARNING: ADMIN_PASS is not set. Using the default development password — set ADMIN_PASS before exposing this server.');
}

server.listen(CONFIG.admin.port, '127.0.0.1', () => {
  console.log(`Admin dashboard: http://localhost:${CONFIG.admin.port}/admin`);
  console.log(`API endpoint: http://localhost:${CONFIG.admin.port}/api/state`);
  console.log(`Credentials: ${CONFIG.admin.auth.user}:${CONFIG.admin.auth.pass}`);
});

process.on('SIGINT', () => {
  console.log('\nShutting down admin server...');
  server.close();
  process.exit(0);
});
