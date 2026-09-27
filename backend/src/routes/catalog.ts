import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db';
import { csv } from '../lib/http';
import { daysAgo, dealFlag, detectEvents, inWindow, isoDay, summarize, weeklyMedians } from '../lib/pricing';
import { getCatalog, requireDevice } from '../services/catalog';
import { deviceDetail } from '../services/deviceDetail';
import { deviceQuerySchema, searchDevices } from '../services/search';
import type { PriceHistory } from '../types';

const priceQuerySchema = z.object({
  range: z.enum(['90d', '1y', 'all']).default('1y'),
  condition: z.enum(['new', 'used', 'refurb', 'all']).default('all'),
});

const compareQuerySchema = z.object({
  ids: csv(z.string()).pipe(z.array(z.string()).min(2).max(4)),
});

export function catalogRoutes(db: Db) {
  const router = Router();

  router.get('/systems', (_req, res) => {
    res.json(getCatalog(db).systems);
  });

  router.get('/devices', (req, res) => {
    const query = deviceQuerySchema.parse(req.query);
    res.json(searchDevices(getCatalog(db), query));
  });

  router.get('/devices/:slug', (req, res) => {
    const catalog = getCatalog(db);
    res.json(deviceDetail(catalog, requireDevice(catalog, req.params.slug)));
  });

  router.get('/devices/:slug/prices', (req, res) => {
    const { range, condition } = priceQuerySchema.parse(req.query);
    const device = requireDevice(getCatalog(db), req.params.slug);

    const now = new Date();
    const from = { '90d': daysAgo(now, 90), '1y': daysAgo(now, 365), all: '0000-01-01' }[range];
    const pricesForCondition =
      condition === 'all' ? device.prices : device.prices.filter((p) => p.condition === condition);
    const pointsInRange = inWindow(pricesForCondition, from, isoDay(now));

    const history: PriceHistory = {
      deviceId: device.card.id,
      range,
      condition,
      points: pointsInRange,
      weekly: weeklyMedians(pointsInRange),
      summary: summarize(pointsInRange, pricesForCondition, now),
      deal: dealFlag(pricesForCondition, now),
      events: detectEvents(pointsInRange, device.card.releaseDate, from),
    };
    res.json(history);
  });

  router.get('/compare', (req, res) => {
    const { ids } = compareQuerySchema.parse(req.query);
    const catalog = getCatalog(db);
    res.json(ids.map((id) => deviceDetail(catalog, requireDevice(catalog, id))));
  });

  return router;
}
