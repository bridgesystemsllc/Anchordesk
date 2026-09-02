/**
 * CLI script to run the renewal drill dry-run.
 * Usage: npm run ops:renewal-drill
 */
import { runRenewalDrill } from '../graph/renewalDrill';
import { log } from '../log';

async function main() {
  const result = await runRenewalDrill();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  log.error('renewal-drill script failed', { error: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
