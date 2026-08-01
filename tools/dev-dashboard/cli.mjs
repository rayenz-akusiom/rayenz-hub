#!/usr/bin/env node
/**
 * CLI for npm scripts: node tools/dev-dashboard/cli.mjs <start|stop|restart|status> <service-id>
 */
import {
  startService,
  stopService,
  restartService,
  getServiceStatus,
  getService,
  listStatuses,
  getLanIPv4,
} from './lib.mjs';

const [action, id] = process.argv.slice(2);

function usage() {
  console.error('Usage: node tools/dev-dashboard/cli.mjs <start|stop|restart|status> [service-id]');
  console.error('       node tools/dev-dashboard/cli.mjs status');
  process.exit(1);
}

if (!action) usage();

try {
  if (action === 'status' && !id) {
    const { lanIp, services } = await listStatuses();
    if (lanIp) console.log(`lanIp      ${lanIp}`);
    for (const s of services) {
      const lan = s.lanUrl ? `  LAN ${s.lanUrl}` : '';
      console.log(`${s.id.padEnd(10)} ${s.status.padEnd(10)} :${s.port}${lan}`);
    }
    process.exit(0);
  }

  if (!id) usage();
  getService(id);

  if (action === 'start') {
    const r = await startService(id);
    console.log(r.message || 'started');
  } else if (action === 'stop') {
    const r = await stopService(id);
    console.log(r.message || 'stopped');
  } else if (action === 'restart') {
    const r = await restartService(id);
    console.log(r.message || 'restarted');
  } else if (action === 'status') {
    const s = await getServiceStatus(getService(id));
    const lan = s.lanUrl ? `  LAN ${s.lanUrl}` : '';
    console.log(`${s.id} ${s.status} :${s.port}${lan}`);
    const ip = getLanIPv4();
    if (ip && !s.lanUrl) console.log(`lanIp ${ip}`);
  } else {
    usage();
  }
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
