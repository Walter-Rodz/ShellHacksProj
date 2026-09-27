import { Router } from 'express';
import type { Db } from '../db';
import { aiBuilderAnswersSchema, runAiBuilder } from '../services/aiBuilder';
import { getCatalog } from '../services/catalog';

/**
 * POST /api/ai-builder
 * Body: the AI Builder's answers, e.g. { "price": "310", "screen": "compact", "os": "linux", "battery": "long" }
 * Returns the top picks with a plain-language reason for each (see AiBuilderResult).
 */
export function aiBuilderRoutes(db: Db) {
  const router = Router();

  router.post('/ai-builder', async (req, res) => {
    // Accept answers in any letter case ("Linux", "COMPACT")
    const raw = Object.fromEntries(
      Object.entries(req.body ?? {}).map(([key, value]) => [
        key,
        typeof value === 'string' ? value.trim().toLowerCase() : value,
      ]),
    );
    const answers = aiBuilderAnswersSchema.parse(raw);
    res.json({ answers, ...(await runAiBuilder(getCatalog(db), answers)) });
  });

  return router;
}
