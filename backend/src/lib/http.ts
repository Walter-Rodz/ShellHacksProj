import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';

type ApiErrorCode = 'bad_request' | 'unauthorized' | 'not_found' | 'internal';

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  internal: 500,
};

/** Throw from a handler; rendered as { error: { code, message, details? } } */
export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new ApiError('not_found', `${what} not found`);

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res
      .status(400)
      .json({ error: { code: 'bad_request', message: 'Invalid request', details: z.treeifyError(err) } });
    return;
  }
  if (err instanceof ApiError) {
    res
      .status(STATUS[err.code])
      .json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  // multer upload errors (file too large, too many files, wrong field name)
  if (err?.name === 'MulterError') {
    res.status(400).json({ error: { code: 'bad_request', message: err.message } });
    return;
  }
  // express.json() body parse errors
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'bad_request', message: 'Malformed JSON body' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'internal', message: 'Internal server error' } });
};

export function notFoundHandler(req: Request, res: Response, _next: NextFunction) {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } });
}

/* ---------- query param helpers: multi-value params are comma-separated ---------- */

export const csv = <T extends z.ZodType<unknown, string>>(item: T) =>
  z
    .string()
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .pipe(z.array(item));

export const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');
export const num = z.coerce.number().finite();
