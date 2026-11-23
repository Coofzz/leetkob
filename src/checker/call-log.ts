// The call log: one JSONL line per model call. It shows which provider request produced which verdicts
// (requestId), what was sent (the prompt: no comment, no identity) and what it would cost.
import { appendFileSync } from 'node:fs';
import type { Prompt } from './prompt.ts';

/** The model the product uses unless LLM_MODEL says otherwise. gemini-2.5-flash answers 404 for new keys. */
export const DEFAULT_MODEL = 'gemini-3.6-flash';

// Paid-tier price of gemini-3.6-flash per million tokens, valid through 2026-12-31 (from 2027-01-01: 1.50 and
// 7.50), from https://ai.google.dev/gemini-api/docs/pricing, read 2026-11-23. Output includes thinking tokens.
// We run on the free tier (0 USD); the cost is computed at the paid price so the cost of a lab is known if
// billing is ever enabled.
export const PRICE_PER_MILLION = { input: 0.75, output: 3.75 };

export function costUsd(promptTokens: number, outputTokens: number): number {
  const usd = (promptTokens * PRICE_PER_MILLION.input + outputTokens * PRICE_PER_MILLION.output) / 1_000_000;
  return Math.round(usd * 1e9) / 1e9;
}

export interface CallEntry {
  submission: string;
  outcome: 'ok' | 'timeout' | 'error';
  ms: number;
  prompt: Prompt;
  requestId?: string;
  model?: string;
  promptTokens?: number;
  outputTokens?: number;
  error?: string;
  /** Constraints a hard rule decided, so the model was not asked about them. */
  skippedByHardRules?: string[];
}

export function appendCall(file: string, entry: CallEntry): void {
  const line = {
    at: new Date().toISOString(),
    ...entry,
    costUsd: costUsd(entry.promptTokens ?? 0, entry.outputTokens ?? 0),
  };
  appendFileSync(file, JSON.stringify(line) + '\n');
}
