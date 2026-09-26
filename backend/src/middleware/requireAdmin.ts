import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { ApiError } from '../lib/http';

/** Team-only routes (photo uploads): requires the `x-admin-key` header to match ADMIN_KEY. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const given = Buffer.from(String(req.headers['x-admin-key'] ?? ''));
  const expected = Buffer.from(config.adminKey);
  // timingSafeEqual so the key can't be guessed from how long the comparison takes
  const matches = given.length === expected.length && timingSafeEqual(given, expected);
  if (!matches) return next(new ApiError('unauthorized', 'Missing or wrong x-admin-key header'));
  next();
}
