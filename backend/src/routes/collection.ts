import { Router } from 'express';
import type { Db } from '../db';
import { getCatalog } from '../services/catalog';
import { collectionRequestSchema, summarizeCollection } from '../services/collection';

/**
 * POST /api/collection/summary
 * Body: the user's saved collection and watchlist (kept in their browser), e.g.
 *   { "items": [{ "slug": "rg35xxsp", "paidUsd": 60 }], "watchlist": [{ "slug": "retroid-pocket-5", "targetPriceUsd": 170 }] }
 * Returns today's values, totals and price alerts (see CollectionResponse). Nothing is stored on the server.
 */
export function collectionRoutes(db: Db) {
  const router = Router();

  router.post('/collection/summary', (req, res) => {
    const request = collectionRequestSchema.parse(req.body ?? {});
    res.json(summarizeCollection(getCatalog(db), request));
  });

  return router;
}
