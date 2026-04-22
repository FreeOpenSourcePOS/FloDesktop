/**
 * One-time repair for the payment_details bug in bills.ts (pre-fix).
 *
 * The old SQL appended `{A}` then `,{A}` on every payment, producing rows like
 *   {"method":"cash","amount":60,...},{"method":"cash","amount":60,...}
 * which is not valid JSON and has a duplicated payment object.
 *
 * This script:
 *   1. Reads each bill's payment_details
 *   2. Tries to parse it as proper JSON — if already valid, leaves it alone
 *   3. Otherwise splits on the `},{` boundary, reconstructs individual objects,
 *      dedupes adjacent identical payments (the phantom duplicates), and writes
 *      back a proper JSON array string
 *   4. Aborts if the repaired paid_amount would disagree with the row's stored
 *      paid_amount — we only trust the repair when the math still balances
 *
 * Usage:
 *   FLO_DB=/Users/bkm/Sites/flo.db npm run repair:payments -- --dry-run   # preview
 *   FLO_DB=/Users/bkm/Sites/flo.db npm run repair:payments -- --apply     # write
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';

const dbPath = process.env.FLO_DB;
if (!dbPath || !fs.existsSync(dbPath)) {
  console.error('Set FLO_DB to an existing flo.db path.');
  process.exit(1);
}

const apply = process.argv.includes('--apply');
const mode = apply ? 'APPLY' : 'DRY-RUN';

const db = new Database(dbPath);
console.log(`🔧 Repair payment_details — ${mode}`);
console.log('   DB: ' + dbPath + '\n');

interface Payment {
  method: string;
  amount: number;
  transaction_id?: string | null;
  notes?: string | null;
  timestamp?: string;
}

function repairCell(raw: string): Payment[] | null {
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p;
    if (p && typeof p === 'object') return [p as Payment];
  } catch {}

  const wrapped = '[' + raw.replace(/}\s*,\s*{/g, '},{') + ']';
  try {
    const p = JSON.parse(wrapped);
    if (Array.isArray(p)) return p as Payment[];
  } catch {}

  return null;
}

function dedupeAdjacent(payments: Payment[]): Payment[] {
  const out: Payment[] = [];
  for (const p of payments) {
    const prev = out[out.length - 1];
    if (prev && prev.method === p.method && prev.amount === p.amount && prev.timestamp === p.timestamp) {
      continue;
    }
    out.push(p);
  }
  return out;
}

const rows = db.prepare(`SELECT id, bill_number, payment_details, paid_amount, total FROM bills`).all() as any[];

let repaired = 0;
let alreadyOk = 0;
let unrepairable = 0;
let mathMismatch = 0;

const update = db.prepare(`UPDATE bills SET payment_details = ?, updated_at = datetime('now') WHERE id = ?`);
const tx = db.transaction((mutations: { id: number; value: string }[]) => {
  for (const m of mutations) update.run(m.value, m.id);
});

const mutations: { id: number; value: string }[] = [];

for (const row of rows) {
  const raw = row.payment_details;
  if (raw == null || raw === '') continue;

  try { JSON.parse(raw); alreadyOk++; continue; } catch {}

  const parsed = repairCell(raw);
  if (!parsed) { unrepairable++; console.log(`   ✗ bill ${row.id} (${row.bill_number}): cannot parse — ${JSON.stringify(raw).slice(0, 80)}…`); continue; }

  const deduped = dedupeAdjacent(parsed);
  const sum = deduped.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  if (Math.abs(sum - row.paid_amount) > 0.02 && Math.abs(parsed.reduce((s, p) => s + (Number(p.amount) || 0), 0) - row.paid_amount) > 0.02) {
    mathMismatch++;
    console.log(`   ⚠ bill ${row.id} (${row.bill_number}): sum(${sum}) != paid_amount(${row.paid_amount}), skipping`);
    continue;
  }

  const chosen = Math.abs(sum - row.paid_amount) <= 0.02 ? deduped : parsed;
  const newValue = JSON.stringify(chosen);
  repaired++;
  console.log(`   ✓ bill ${row.id} (${row.bill_number}): ${parsed.length} → ${chosen.length} payment(s), sum=${chosen.reduce((s, p) => s + (Number(p.amount) || 0), 0)}`);
  mutations.push({ id: row.id, value: newValue });
}

console.log('\nSummary:');
console.log('  already valid:  ' + alreadyOk);
console.log('  repaired:       ' + repaired);
console.log('  unrepairable:   ' + unrepairable);
console.log('  math mismatch:  ' + mathMismatch);

if (mutations.length === 0) {
  console.log('\nNothing to write.');
  process.exit(0);
}

if (!apply) {
  console.log('\nDry run — no changes written. Re-run with --apply to commit.');
  process.exit(0);
}

db.exec(`ATTACH DATABASE '${dbPath}.repair-backup-${Date.now()}' AS backup`);
db.exec(`CREATE TABLE backup.bills AS SELECT * FROM main.bills`);
db.exec(`DETACH DATABASE backup`);

tx(mutations);
console.log('\n✅ Applied ' + mutations.length + ' updates. (backup copy of bills saved alongside the DB)');
