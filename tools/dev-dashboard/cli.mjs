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
    const list = await listStatuses();
    for (const s of list) {
      console.log(`${s.id.padEnd(10)} ${s.status.padEnd(10)} :${s.port}`);
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
    console.log(`${s.id} ${s.status} :${s.port}`);
  } else {
    usage();
  }
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
