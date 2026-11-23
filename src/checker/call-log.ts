// The call log: one JSONL line per model call. It shows which provider request produced which verdicts
// (requestId), what was sent (the prompt: no comment, no identity) and what it would cost.
import { appendFileSync } from 'node:fs';
import type { Prompt } from './prompt.ts';

// Paid-tier price of gemini-2.5-flash per million tokens (https://ai.google.dev/gemini-api/docs/pricing,
// read 2026-11-23); output includes thinking tokens. We run on the free tier (0 USD); the cost is computed
// at the paid price so the cost of a lab is known if billing is ever enabled.
export const PRICE_PER_MILLION = { input: 0.3, output: 2.5 };

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
