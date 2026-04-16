/**
 * One-shot script: assign a first name to every existing device
 * that doesn't have one yet.
 *
 * Run with:  node backend/scripts/backfillDeviceNames.js
 * Safe to re-run — it's idempotent (skips devices that already have a name).
 */

const { getAllKnownDeviceIds, getDeviceName, getOrAssignDeviceName } = require('../src/services/database');

const all = getAllKnownDeviceIds();
console.log(`Found ${all.length} distinct device IDs across all tables.`);

let assigned = 0;
let skipped = 0;
let failed = 0;

for (const deviceId of all) {
  if (getDeviceName(deviceId)) {
    skipped++;
    continue;
  }
  const name = getOrAssignDeviceName(deviceId);
  if (name) {
    assigned++;
    console.log(`  → ${deviceId.slice(0, 12)}… = ${name}`);
  } else {
    failed++;
    console.warn(`  ✗ failed to assign name for ${deviceId}`);
  }
}

console.log('');
console.log(`Done. Assigned: ${assigned}  Skipped (already named): ${skipped}  Failed: ${failed}`);
process.exit(0);
