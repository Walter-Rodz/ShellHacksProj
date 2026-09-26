import cors from 'cors';
import express from 'express';
import { config } from './config';
import type { Db } from './db';
import { errorHandler, notFoundHandler } from './lib/http';
import { catalogRoutes } from './routes/catalog';

export function createApp(db: Db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Public: systems, devices, prices, compare
  app.use('/api', catalogRoutes(db));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
