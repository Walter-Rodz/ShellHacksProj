import { Router } from 'express';
import type { Db } from '../db';
import { getCatalog } from '../services/catalog';
import { chat, chatRequestSchema } from '../services/chat';

/**
 * POST /api/ai/chat
 * Body: the conversation so far, oldest first, ending with the user's new message:
 *   { "messages": [ { "role": "user", "content": "I want something for GBA under $100" } ] }
 * Returns { reply, consoles, answeredBy } (see ChatResponse).
 */
export function chatRoutes(db: Db) {
  const router = Router();

  router.post('/ai/chat', async (req, res) => {
    const request = chatRequestSchema.parse(req.body);
    res.json(await chat(getCatalog(db), request));
  });

  return router;
}
