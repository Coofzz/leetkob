// Gemini generateContent over REST with fetch (no SDK). The caller reads the key from the server's
// environment; it is sent only in the x-goog-api-key header — never in a URL, a log or an error.
// Response fields used: responseId, modelVersion, candidates[].content.parts[].text and usageMetadata
// (https://ai.google.dev/api/generate-content, read 2026-11-23).
import type { Prompt } from './prompt.ts';
import { ANSWER_SCHEMA } from './prompt.ts';

export interface ModelReply {
  text: string;
  requestId: string; // the provider's responseId
  model: string; // the provider's modelVersion
  promptTokens: number;
  outputTokens: number; // candidates + thinking tokens: both are billed as output
  ms: number;
}

export type ModelClient = (prompt: Prompt) => Promise<ModelReply>;

export class ModelTimeoutError extends Error {
  constructor(ms: number) {
    super(`the model did not answer within ${ms} ms`);
    this.name = 'ModelTimeoutError';
  }
}

export interface GeminiOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
}

interface GenerateContentResponse {
  responseId?: string;
  modelVersion?: string;
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
}

const BASE_URL = 'https://generativelanguage.googleapis.com';

export function createGeminiClient(options: GeminiOptions): ModelClient {
  if (!options.apiKey) throw new Error('LLM_API_KEY is not set');
  const fetchFn = options.fetchFn ?? ((url: string, init: RequestInit) => fetch(url, init));
  const url = `${BASE_URL}/v1beta/models/${encodeURIComponent(options.model)}:generateContent`;

  return async (prompt) => {
    const started = Date.now();
    // An explicit timer (not AbortSignal.timeout, whose timer is unref'd): the wait itself keeps the
    // process alive, and the timer is cleared as soon as the call ends.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    const signal = controller.signal;
    let body: GenerateContentResponse;
    try {
      const res = await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: prompt.system }] },
          contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
          generationConfig: { responseMimeType: 'application/json', responseJsonSchema: ANSWER_SCHEMA },
        }),
        signal,
      });
      if (!res.ok) throw new ProviderError(res.status);
      body = (await res.json()) as GenerateContentResponse;
    } catch (err) {
      if (signal.aborted) throw new ModelTimeoutError(options.timeoutMs);
      if (err instanceof ProviderError) throw err;
      // Never pass on a message we did not write, nor attach it as `cause` (console.error prints the
      // cause chain): it could carry request details.
      // eslint-disable-next-line preserve-caught-error
      throw new Error('the model provider could not be reached');
    } finally {
      clearTimeout(timer);
    }
    const usage = body.usageMetadata ?? {};
    return {
      text: (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join(''),
      requestId: body.responseId ?? '',
      model: body.modelVersion ?? options.model,
      promptTokens: usage.promptTokenCount ?? 0,
      outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
      ms: Date.now() - started,
    };
  };
}

class ProviderError extends Error {
  constructor(status: number) {
    super(`the model provider answered HTTP ${status}`);
    this.name = 'ProviderError';
  }
}
