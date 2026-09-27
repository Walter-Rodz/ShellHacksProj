import cors from 'cors';
import express from 'express';
import { config, isAllowedOrigin } from './config';
import type { Db } from './db';
import { errorHandler, notFoundHandler } from './lib/http';
import { catalogRoutes } from './routes/catalog';
import { aiRoutes } from './routes/ai';
import { aiBuilderRoutes } from './routes/aiBuilder';
import { chatRoutes } from './routes/chat';
import { collectionRoutes } from './routes/collection';

export function createApp(db: Db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: (origin, allow) => allow(null, !origin || isAllowedOrigin(origin)) }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Public: systems, devices, prices, compare
  app.use('/api', catalogRoutes(db));

  // AI assistant endpoints (optional)
  app.use('/api', aiRoutes(db));

  // AI Builder: the frontend's 4-question wizard -> ranked picks with explanations
  app.use('/api', aiBuilderRoutes(db));

  // "Ask AI" chat about the catalog
  app.use('/api', chatRoutes(db));

  // "My Collection" values and price tracking (the lists are saved in the user's browser)
  app.use('/api', collectionRoutes(db));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
