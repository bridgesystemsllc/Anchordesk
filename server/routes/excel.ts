import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../db/client';
import { csExcelBindings, csExcelAppends, csTickets } from '../db/schema';
import { env } from '../env';
import { errFields, log } from '../log';

export const excelRouter = Router();

interface ExcelPreview {
  columns: string[];
  rows: string[][];
  workbookId: string | null;
  worksheet: string;
  demo?: boolean;
}

interface ExcelFixture {
  bindingId: string;
  workbookId: string;
  worksheet: string;
  columns: string[];
  rows: string[][];
}

function loadFixture(bindingId: string): ExcelFixture | null {
  const fixturePath = join(process.cwd(), 'tests/fixtures/excel-returns-log.json');
  if (!existsSync(fixturePath)) return null;
  try {
    const data = JSON.parse(readFileSync(fixturePath, 'utf-8')) as ExcelFixture;
    if (data.bindingId === bindingId || bindingId === 'fixture-returns') {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * GET /api/excel/:bindingId/preview
 * Returns sheet columns and rows for preview.
 * 401 unauthorized - missing auth
 * 404 not_found - binding not found
 * 503 excel_unavailable - Graph error
 */
excelRouter.get('/excel/:bindingId/preview', async (req, res) => {
  const bindingId = req.params.bindingId;

  const [binding] = await db
    .select()
    .from(csExcelBindings)
    .where(eq(csExcelBindings.id, bindingId))
    .limit(1);

  if (!binding) {
    res.status(404).json({ error: 'not_found', message: 'Binding not found' });
    return;
  }

  const graphToken = env.GRAPH_ACCESS_TOKEN;

  if (!graphToken) {
    const fixture = loadFixture(bindingId);
    if (fixture) {
      const response: ExcelPreview = {
        columns: fixture.columns,
        rows: fixture.rows,
        workbookId: fixture.workbookId,
        worksheet: fixture.worksheet,
        demo: true,
      };
      res.json(response);
      return;
    }

    const response: ExcelPreview = {
      columns: [],
      rows: [],
      workbookId: binding.workbookId,
      worksheet: binding.worksheet,
      demo: true,
    };
    res.json(response);
    return;
  }

  try {
    const workbookId = binding.workbookId;
    if (!workbookId) {
      res.status(503).json({ error: 'excel_unavailable', message: 'Sheets could not be loaded' });
      return;
    }

    const url = `https://graph.microsoft.com/v1.0/me/drive/items/${workbookId}/workbook/worksheets/${encodeURIComponent(binding.worksheet)}/usedRange`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${graphToken}` },
    });

    if (response.status === 401) {
      res.status(401).json({ error: 'unauthorized', message: 'Sheets could not be loaded' });
      return;
    }

    if (!response.ok) {
      log.error('Graph Excel API error', { status: response.status, bindingId });
      res.status(503).json({ error: 'excel_unavailable', message: 'Sheets could not be loaded' });
      return;
    }

    const data = (await response.json()) as { values?: string[][] };
    const values = data.values ?? [];
    const columns = values[0] ?? [];
    const rows = values.slice(1);

    const preview: ExcelPreview = {
      columns,
      rows,
      workbookId,
      worksheet: binding.worksheet,
    };
    res.json(preview);
  } catch (e) {
    log.error('Excel preview failed', errFields(e));
    res.status(503).json({ error: 'excel_unavailable', message: 'Sheets could not be loaded' });
  }
});

const appendBody = z.object({
  ticketId: z.string().uuid(),
  values: z.array(z.string()).optional(),
});

/**
 * POST /api/excel/:bindingId/append
 * Appends a row to the sheet for a ticket.
 * 400 invalid_body - missing ticketId or invalid body
 * 401 unauthorized - missing auth
 * 404 not_found - binding not found
 * 409 duplicate_append - already appended for this ticket/binding
 * 503 excel_unavailable - Graph error
 */
excelRouter.post('/excel/:bindingId/append', async (req, res) => {
  const bindingId = req.params.bindingId;

  const parsed = appendBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }

  const { ticketId, values } = parsed.data;

  const [binding] = await db
    .select()
    .from(csExcelBindings)
    .where(eq(csExcelBindings.id, bindingId))
    .limit(1);

  if (!binding) {
    res.status(404).json({ error: 'not_found', message: 'Binding not found' });
    return;
  }

  const [ticket] = await db
    .select({ id: csTickets.id })
    .from(csTickets)
    .where(eq(csTickets.id, ticketId))
    .limit(1);

  if (!ticket) {
    res.status(404).json({ error: 'not_found', message: 'Ticket not found' });
    return;
  }

  const [existing] = await db
    .select({ id: csExcelAppends.id })
    .from(csExcelAppends)
    .where(and(eq(csExcelAppends.ticketId, ticketId), eq(csExcelAppends.bindingId, bindingId)))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: 'duplicate_append', message: 'Row already appended' });
    return;
  }

  const graphToken = env.GRAPH_ACCESS_TOKEN;

  if (!graphToken) {
    const [inserted] = await db
      .insert(csExcelAppends)
      .values({
        ticketId,
        bindingId,
        rowIndex: null,
        values: values ?? null,
      })
      .returning({ id: csExcelAppends.id });

    res.json({
      ok: true,
      bindingId,
      ticketId,
      rowIndex: null,
      appendId: inserted?.id,
    });
    return;
  }

  try {
    const workbookId = binding.workbookId;
    if (!workbookId) {
      res.status(503).json({ error: 'excel_unavailable', message: 'Row could not be appended' });
      return;
    }

    const url = `https://graph.microsoft.com/v1.0/me/drive/items/${workbookId}/workbook/worksheets/${encodeURIComponent(binding.worksheet)}/tables/1/rows/add`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${graphToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [values ?? []] }),
    });

    if (response.status === 401) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    if (!response.ok) {
      log.error('Graph Excel append error', { status: response.status, bindingId, ticketId });
      res.status(503).json({ error: 'excel_unavailable', message: 'Row could not be appended' });
      return;
    }

    const data = (await response.json()) as { index?: number };

    const [inserted] = await db
      .insert(csExcelAppends)
      .values({
        ticketId,
        bindingId,
        rowIndex: data.index ?? null,
        values: values ?? null,
      })
      .returning({ id: csExcelAppends.id });

    res.json({
      ok: true,
      bindingId,
      ticketId,
      rowIndex: data.index ?? null,
      appendId: inserted?.id,
    });
  } catch (e) {
    log.error('Excel append failed', errFields(e));
    res.status(503).json({ error: 'excel_unavailable', message: 'Row could not be appended' });
  }
});

/**
 * Append row to Excel for a ticket, used by resolve handler.
 * Returns true if appended, false if already exists or failed.
 * Does not throw on 409 or 503 — resolve should still succeed.
 */
export async function appendExcelRow(
  bindingId: string,
  ticketId: string,
  values?: string[],
): Promise<{ ok: boolean; rowIndex: number | null; error?: string }> {
  const [binding] = await db
    .select()
    .from(csExcelBindings)
    .where(eq(csExcelBindings.id, bindingId))
    .limit(1);

  if (!binding) {
    return { ok: false, rowIndex: null, error: 'not_found' };
  }

  const [existing] = await db
    .select({ id: csExcelAppends.id })
    .from(csExcelAppends)
    .where(and(eq(csExcelAppends.ticketId, ticketId), eq(csExcelAppends.bindingId, bindingId)))
    .limit(1);

  if (existing) {
    return { ok: false, rowIndex: null, error: 'duplicate_append' };
  }

  const graphToken = env.GRAPH_ACCESS_TOKEN;

  if (!graphToken) {
    await db.insert(csExcelAppends).values({
      ticketId,
      bindingId,
      rowIndex: null,
      values: values ?? null,
    });
    return { ok: true, rowIndex: null };
  }

  try {
    const workbookId = binding.workbookId;
    if (!workbookId) {
      return { ok: false, rowIndex: null, error: 'excel_unavailable' };
    }

    const url = `https://graph.microsoft.com/v1.0/me/drive/items/${workbookId}/workbook/worksheets/${encodeURIComponent(binding.worksheet)}/tables/1/rows/add`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${graphToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [values ?? []] }),
    });

    if (!response.ok) {
      log.error('Graph Excel append error in helper', { status: response.status, bindingId, ticketId });
      return { ok: false, rowIndex: null, error: 'excel_unavailable' };
    }

    const data = (await response.json()) as { index?: number };

    await db.insert(csExcelAppends).values({
      ticketId,
      bindingId,
      rowIndex: data.index ?? null,
      values: values ?? null,
    });

    return { ok: true, rowIndex: data.index ?? null };
  } catch (e) {
    log.error('Excel append helper failed', errFields(e));
    return { ok: false, rowIndex: null, error: 'excel_unavailable' };
  }
}
