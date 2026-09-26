import cors from 'cors';
import express from 'express';
import { config } from './config';
import type { Db } from './db';
import { errorHandler, notFoundHandler } from './lib/http';
import { catalogRoutes } from './routes/catalog';
import { imageRoutes } from './routes/images';

export function createApp(db: Db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));

  // Uploaded photos and logos. File names never change, so browsers can cache them forever.
  app.use('/uploads', express.static(config.uploadsDir, { immutable: true, maxAge: '365d', index: false }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Public: systems, devices, prices, compare
  app.use('/api', catalogRoutes(db));

  // Team only (x-admin-key header): console photos and brand logos
  app.use('/api', imageRoutes(db));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
