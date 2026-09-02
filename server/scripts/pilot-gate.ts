/**
 * CLI script to validate the pilot-day fixture.
 * Exits 0 if exactly 30 rows, all @example.com, all required fields present.
 * Usage: npm run ops:pilot-gate
 */
import pilotData from '../test/fixtures/pilot-day.json';

interface PilotRow {
  id: string;
  customerEmail: string;
  customerName: string;
  agent: string;
  brand: string;
  subject: string;
}

function main() {
  const rows = pilotData as PilotRow[];

  if (rows.length !== 30) {
    console.error(`ERROR: Expected exactly 30 rows, got ${rows.length}`);
    process.exit(1);
  }

  const errors: string[] = [];

  for (const row of rows) {
    if (!row.id) {
      errors.push(`Row missing id`);
    }
    if (!row.customerEmail) {
      errors.push(`Row ${row.id}: missing customerEmail`);
    } else if (!row.customerEmail.endsWith('@example.com')) {
      errors.push(`Row ${row.id}: email ${row.customerEmail} does not end with @example.com`);
    }
    if (!row.customerName) {
      errors.push(`Row ${row.id}: missing customerName`);
    }
    if (!row.agent) {
      errors.push(`Row ${row.id}: missing agent`);
    }
    if (!row.brand) {
      errors.push(`Row ${row.id}: missing brand`);
    }
    if (!row.subject) {
      errors.push(`Row ${row.id}: missing subject`);
    }
  }

  if (errors.length > 0) {
    console.error('Pilot gate FAILED:');
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    process.exit(1);
  }

  console.log('Pilot gate PASSED: 30 valid rows, all @example.com');
  process.exit(0);
}

main();
