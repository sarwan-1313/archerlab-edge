// Writes dist/.well-known/assetlinks.json, which lets the Play Store app (a Trusted Web Activity)
// open this site full screen without a browser bar. It needs the Android package name and the
// SHA-256 fingerprint of the app signing key from Play Console → Setup → App integrity.
// Set them as environment variables (e.g. in Vercel); without them nothing is written.
//   TWA_PACKAGE_NAME=app.archerlab.edge
//   TWA_SHA256_FINGERPRINTS=AB:CD:…,12:34:…   (comma-separated: Play signing key, and optionally your upload key)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageName = process.env.TWA_PACKAGE_NAME?.trim();
const fingerprints = (process.env.TWA_SHA256_FINGERPRINTS ?? '').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
const valid = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

if (!packageName || !fingerprints.length) {
  console.log('assetlinks: TWA_PACKAGE_NAME or TWA_SHA256_FINGERPRINTS not set, skipping (only needed for the Play Store app).');
  process.exit(0);
}
const bad = fingerprints.filter((value) => !valid.test(value));
if (bad.length) {
  console.error(`assetlinks: these are not SHA-256 fingerprints (32 pairs of hex digits separated by colons): ${bad.join(', ')}`);
  process.exit(1);
}
const links = [{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: fingerprints },
}];
const file = join(root, 'dist', '.well-known', 'assetlinks.json');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, `${JSON.stringify(links, null, 2)}\n`);
console.log(`assetlinks: wrote ${file} for ${packageName} (${fingerprints.length} key${fingerprints.length === 1 ? '' : 's'}).`);
