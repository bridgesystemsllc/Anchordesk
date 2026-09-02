/**
 * AI assist routes: draft, summarize, policy-check, similar.
 */

import { Router } from 'express';
import { z } from 'zod';
import { generateDraft, DraftError } from '../ai/draft';
import { summarizeThread, checkPolicy, findSimilarTicketsAndRecord, AssistError } from '../ai/assist';
import { errFields, log } from '../log';

export const assistRouter = Router();

assistRouter.post('/tickets/:id/draft', async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: 'invalid_id' });
    return;
  }

  try {
    const result = await generateDraft(id.data);
    res.json(result);
  } catch (e) {
    if (e instanceof DraftError) {
      res.status(e.httpStatus).json({
        error: e.code,
        message: e.message,
      });
      return;
    }
    log.error('draft route failed', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

assistRouter.post('/tickets/:id/summarize', async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: 'invalid_id' });
    return;
  }

  try {
    const result = await summarizeThread(id.data);
    res.json(result);
  } catch (e) {
    if (e instanceof AssistError) {
      res.status(e.httpStatus).json({
        error: e.code,
        message: e.message,
      });
      return;
    }
    log.error('summarize route failed', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

assistRouter.post('/tickets/:id/policy-check', async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: 'invalid_id' });
    return;
  }

  try {
    const result = await checkPolicy(id.data);
    res.json(result);
  } catch (e) {
    if (e instanceof AssistError) {
      res.status(e.httpStatus).json({
        error: e.code,
        message: e.message,
      });
      return;
    }
    log.error('policy-check route failed', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

assistRouter.post('/tickets/:id/similar', async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: 'invalid_id' });
    return;
  }

  try {
    const result = await findSimilarTicketsAndRecord(id.data);
    res.json(result);
  } catch (e) {
    log.error('similar route failed', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});
