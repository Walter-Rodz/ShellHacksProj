import { Router } from 'express';
import type { Db } from '../db';
import { getCatalog } from '../services/catalog';
import { parseAnswersToDeviceQuery } from '../services/ai';
import { searchDevices } from '../services/search';

export function aiRoutes(_db: Db) {
  const router = Router();

  router.post('/ai/recommend', async (req, res, next) => {
    try {
      const answers = String(req.body?.answers ?? '').trim();
      if (!answers) return res.status(400).json({ error: 'answers required' });

      const catalog = getCatalog(_db);
      const query = await parseAnswersToDeviceQuery(answers);

      // Ask for a reasonably large page to ensure we can return the top 3 matches.
      const mergedQuery = { ...query, page: 1, pageSize: 60 } as any;
      const results = searchDevices(catalog, mergedQuery);
      const top = results.items.slice(0, 3);

      res.json({ query: mergedQuery, matches: top });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
