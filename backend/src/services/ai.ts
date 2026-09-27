import { deviceQuerySchema, type DeviceQuery } from './search';
import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';

// create ai only when key is present
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

export async function parseAnswersToDeviceQuery(
    answers: string
): Promise<DeviceQuery> {

    if (!process.env.GEMINI_API_KEY || !ai) {
        return deviceQuerySchema.parse({
            q: answers,
            page: 1,
            pageSize: 24
        });
    }

    const system = `
You are a JSON extractor.

Convert the user's answers about their desired retro handheld
into a DeviceQuery object.

Only use these fields:
q, category, formFactor, brand, priceMin, priceMax,
screenMin, screenMax, panel, aspect, os, sticks,
hallSticks, triggers, batteryMin, wifi, bluetooth,
videoOut, tier, playsWell, fitFor, fitMin, status, sort.

Use numbers for numeric fields and booleans for yes/no fields.
For fields that accept multiple values (such as formFactor,
brand, os, tier, and playsWell), return a comma-separated string.
For example: "vertical,clamshell".

If the user did not specify something, omit it.

Return ONLY valid JSON.
`;

    try {
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: `User answers: ${answers}`,
            config: {
                systemInstruction: system,
                responseMimeType: "application/json",
                temperature: 0,
            },
        });

        // guard response.text before parsing
        const text = typeof response.text === 'string' ? response.text : null;
        if (!text) {
            throw new Error('No response.text from model');
        }

        const parsed = JSON.parse(text);
        console.log('Parsed from Gemini:', JSON.stringify(parsed, null, 2));
        // Normalize string boolean values to actual booleans
        const normalized = normalizeQuery(parsed);
        console.log('After normalization:', JSON.stringify(normalized, null, 2));
        return deviceQuerySchema.parse(normalized);

    } catch (error) {
        console.error("Gemini error:", error);

        return deviceQuerySchema.parse({
            q: answers,
            page: 1,
            pageSize: 24
        });
    }
}

/** Convert boolean values to strings that zod expects ("true"/"false") */
function normalizeQuery(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;

    const booleanFields = ['hallSticks', 'triggers', 'wifi', 'bluetooth', 'videoOut'];
    const result = { ...obj };

    for (const field of booleanFields) {
        if (field in result) {
            const val = result[field];
            // Convert to string "true" or "false"
            if (typeof val === 'boolean') {
                result[field] = val ? 'true' : 'false';
            } else if (typeof val === 'string') {
                // Already a string, ensure it's one of the valid values
                const lower = val.toLowerCase().trim();
                result[field] = ['true', 'yes', '1', 'y', 'ok', 'want', 'need', 'prefer'].includes(lower) ? 'true' : 'false';
            } else if (typeof val === 'number') {
                result[field] = val !== 0 ? 'true' : 'false';
            }
        }
    }

    return result;
}