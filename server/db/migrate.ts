import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDb, pool } from './client';
import { errFields, log } from '../log';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Minimal forward-only migrator. Each file runs once inside a transaction and
 * is recorded in _migrations. A failed file rolls back and aborts the run, so
 * the database is never left half-migrated.
 */
export async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query<{ name: string }>('SELECT name FROM _migrations');
    const applied = new Set(rows.map((r) => r.name));

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      log.info('applying migration', { file });
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        ran++;
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${e instanceof Error ? e.message : String(e)}`, {
          cause: e,
        });
      }
    }

    log.info('migrations up to date', { applied: ran, total: files.length });
  } finally {
    client.release();
  }
}

// `npm run db:migrate`
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => closeDb())
    .then(() => process.exit(0))
    .catch(async (e) => {
      log.error('migration run failed', errFields(e));
      await closeDb().catch(() => {});
      process.exit(1);
    });
}
