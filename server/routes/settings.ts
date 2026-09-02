import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { csExcelBindings } from '../db/schema';

export const settingsRouter = Router();

/**
 * GET /api/settings/bindings
 * Returns all enabled Excel bindings for the dropdown selector.
 */
settingsRouter.get('/settings/bindings', async (_req, res) => {
  const bindings = await db
    .select({
      id: csExcelBindings.id,
      name: csExcelBindings.name,
      workbookId: csExcelBindings.workbookId,
      worksheet: csExcelBindings.worksheet,
      owner: csExcelBindings.owner,
      autoAppendOn: csExcelBindings.autoAppendOn,
    })
    .from(csExcelBindings)
    .where(eq(csExcelBindings.enabled, true));

  res.json({ bindings });
});
