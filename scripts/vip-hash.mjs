// Prints the hash for a VIP code. Put the result in VITE_VIP_CODE_HASH (Vercel → Settings →
// Environment Variables) and redeploy; only the hash ships in the app, never the code.
//   node scripts/vip-hash.mjs YOURCODE
import { createHash } from 'node:crypto';

const code = (process.argv[2] ?? '').replace(/[^0-9a-z]/gi, '').toUpperCase();
if (code.length !== 4) {
  console.error('Give a 4-character code of letters and digits, e.g. node scripts/vip-hash.mjs A7K2');
  process.exit(1);
}
console.log(createHash('sha256').update(`archerlab-vip:${code}`).digest('hex'));
