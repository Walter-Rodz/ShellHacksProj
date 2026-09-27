import { GoogleGenAI } from '@google/genai';
import type { z } from 'zod';

/*
 * One place for calling Gemini and getting JSON back (used by the AI Builder and the chat).
 * - Tries GEMINI_MODEL first. When a model is overloaded (503 "high demand"), out of quota (429, e.g. the free
 *   daily limit is used up) or too slow, it moves on to the next one in GEMINI_FALLBACK_MODELS.
 * - The reply must be JSON matching `schema`; anything else counts as a failure.
 * - Returns null when there's no API key or every model failed, so callers can fall back to something non-AI.
 */

const TIMEOUT_MS = 20_000;
const DEFAULT_MODEL = 'gemini-3.8-flash';
const DEFAULT_FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.1-flash-lite'];

export type GeminiMessage = { role: 'user' | 'model'; text: string };

export async function askGeminiForJson<T>(options: {
  systemInstruction: string;
  /** A single prompt, or a whole conversation (oldest first) */
  contents: string | GeminiMessage[];
  schema: z.ZodType<T>;
  temperature?: number;
  /** Shown in the server log when a model fails */
  label: string;
}): Promise<T | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });
  const contents =
    typeof options.contents === 'string'
      ? options.contents
      : options.contents.map((message) => ({ role: message.role, parts: [{ text: message.text }] }));

  for (const model of modelsToTry()) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: options.systemInstruction,
            responseMimeType: 'application/json',
            temperature: options.temperature ?? 0.3,
          },
        }),
        TIMEOUT_MS,
      );
      return options.schema.parse(JSON.parse(response.text ?? ''));
    } catch (err) {
      const status = (err as { status?: number }).status;
      const unavailable = status === 503 || status === 429 || /timed out/.test(String(err));
      console.error(`${options.label}: ${model} failed:`, (err as Error).message?.slice(0, 200));
      if (!unavailable) return null; // a real problem (bad key, bad reply): don't keep trying
      // Overloaded, out of quota or too slow: this model can't answer right now, so try the next one
    }
  }
  return null;
}

function modelsToTry() {
  const fallbacks =
    process.env.GEMINI_FALLBACK_MODELS?.split(',').map((model) => model.trim()) ?? DEFAULT_FALLBACK_MODELS;
  return [...new Set([process.env.GEMINI_MODEL ?? DEFAULT_MODEL, ...fallbacks].filter(Boolean))];
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms)),
  ]);
}
