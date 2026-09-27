import { z } from 'zod';
import { askGeminiForJson } from '../lib/gemini';
import type { DeviceCard } from '../types';
import { playsAtLeast, type Catalog, type CatalogDevice } from './catalog';

/*
 * The "Ask AI" chat. The frontend sends the whole conversation each time (the backend keeps no chat history).
 * Gemini gets a compact copy of the catalog, so it only talks about consoles we have, with our facts and prices.
 * Every reply comes back with the consoles it recommends (as cards the page can show and click).
 */

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_RECOMMENDED = 3;

export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
      }),
    )
    .min(1)
    .max(MAX_MESSAGES)
    .refine((messages) => messages.at(-1)?.role === 'user', 'The last message must be from the user'),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export interface ChatResponse {
  reply: string;
  /** Consoles recommended in this reply (0–3), in the order mentioned */
  consoles: DeviceCard[];
  /** "gemini", or "unavailable" when Gemini couldn't answer (the reply then says so) */
  answeredBy: 'gemini' | 'unavailable';
}

/** Systems people ask about, with the names they use */
const SYSTEM_NAMES: [string, string][] = [
  ['gb', 'GB'],
  ['gbc', 'GBC'],
  ['gba', 'GBA'],
  ['nes', 'NES'],
  ['snes', 'SNES'],
  ['md', 'Genesis'],
  ['arcade', 'Arcade'],
  ['psx', 'PS1'],
  ['n64', 'N64'],
  ['saturn', 'Saturn'],
  ['nds', 'DS'],
  ['dc', 'Dreamcast'],
  ['psp', 'PSP'],
  ['gc', 'GameCube'],
  ['ps2', 'PS2'],
  ['wii', 'Wii'],
  ['3ds', '3DS'],
  ['vita', 'Vita'],
  ['switch', 'Switch'],
];

const replySchema = z.object({
  reply: z.string().min(1),
  consoleIds: z.array(z.string()).default([]),
});

export async function chat(catalog: Catalog, request: ChatRequest): Promise<ChatResponse> {
  const answer = await askGeminiForJson({
    label: 'Chat',
    systemInstruction: instructions(catalog),
    contents: request.messages.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      text: message.content,
    })),
    schema: replySchema,
    temperature: 0.5,
  });

  if (!answer) {
    return {
      reply:
        'Sorry, the AI assistant is busy right now. Please try again in a moment, or use the filters and the AI Builder in the meantime.',
      consoles: [],
      answeredBy: 'unavailable',
    };
  }

  // Only real consoles, once each
  const consoles = [...new Set(answer.consoleIds)]
    .map((id) => catalog.byId.get(id)?.card)
    .filter((card): card is DeviceCard => card !== undefined)
    .slice(0, MAX_RECOMMENDED);

  return { reply: answer.reply.trim(), consoles, answeredBy: 'gemini' };
}

function instructions(catalog: Catalog) {
  return `You are the friendly assistant on a website for retro gaming handhelds. You help people choose a console.

Only talk about consoles in the CATALOG below, and only use the facts listed there (never invent specs, prices or
consoles). Prices are current market prices in USD. "plays well" lists the systems a console emulates well.
If someone asks about something unrelated to retro handhelds, gently steer back.

When the request is vague, ask ONE short follow-up question at a time about what matters most:
1. Which systems they want to play (e.g. GB/GBA, PS1, Dreamcast, PS2, DS, Switch)
2. Form factor and size (horizontal, vertical, clamshell, dual screen, pocketable)
3. Budget
Once you know enough, recommend 1 to ${MAX_RECOMMENDED} consoles and say briefly why each fits.
Keep replies short (under 90 words), plain text, no markdown or bullet symbols.

Reply with JSON only: {"reply": "your message", "consoleIds": ["ids of consoles you recommend in this reply"]}
Use the exact ids from the catalog. Use an empty list when you're only asking a question.

CATALOG (id | name | brand | price | form factor | screen | OS | battery | plays well):
${catalog.devices.map(catalogLine).join('\n')}`;
}

function catalogLine(device: CatalogDevice) {
  const { card, specs, os } = device;
  const playsWell = SYSTEM_NAMES.filter(([id]) => playsAtLeast(device.ratingBySystem.get(id), 'good')).map(
    ([, name]) => name,
  );
  return [
    card.id,
    card.name,
    card.brand,
    card.startingPriceUsd !== null ? `$${card.startingPriceUsd}` : 'price unknown',
    card.formFactor + (specs.screen?.secondary ? ', dual screen' : ''),
    card.screenSizeIn !== null ? `${card.screenSizeIn}"` : '?',
    os.map((option) => option.name).join('/') || '?',
    specs.batteryMah ? `${specs.batteryMah}mAh` : '?',
    playsWell.join(', ') || 'none listed',
  ].join(' | ');
}
