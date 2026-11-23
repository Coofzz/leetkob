// The semantic review of one submission: de-identify → prompt → model → schema check, under a timeout.
// Nothing the model says reaches a verdict without passing validateAnswer; a slow or failing model
// gives unsure with a reason (FAQ-09). One call-log line per call.
import type { CallEntry } from './call-log.ts';
import { deidentify } from './deidentify.ts';
import { ModelTimeoutError, type ModelClient, type ModelReply } from './gemini.ts';
import { buildPrompt } from './prompt.ts';
import type { SemanticReview } from './review.ts';
import { unsure, validateAnswer } from './validate.ts';

export interface SemanticOptions {
  client: ModelClient;
  timeoutMs: number;
  /** Receives one entry per call; the caller adds which submission it was. */
  onCall?: (entry: Omit<CallEntry, 'submission'>) => void;
}

const TIMED_OUT = Symbol('timed out');

export function createSemanticReview(options: SemanticOptions): SemanticReview {
  return async (input, info = {}) => {
    const ids = input.constraints.map((c) => c.id);
    const seen = deidentify(input.source);
    const prompt = buildPrompt({
      statement: input.statement,
      constraints: input.constraints,
      numberedCode: seen.numbered,
    });
    const started = Date.now();
    const log = (entry: Omit<CallEntry, 'submission' | 'prompt' | 'skippedByHardRules'>) =>
      options.onCall?.({ ...entry, prompt, skippedByHardRules: info.skippedByHardRules ?? [] });

    // Our own timeout, whatever the client does with its own: the review never waits longer.
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), options.timeoutMs);
    });
    let replyOrTimeout: ModelReply | typeof TIMED_OUT;
    try {
      replyOrTimeout = await Promise.race([options.client(prompt), deadline]);
    } catch (err) {
      const timedOut = err instanceof ModelTimeoutError;
      log({
        outcome: timedOut ? 'timeout' : 'error',
        ms: Date.now() - started,
        error: (err as Error).message,
      });
      return ids.map((id) => unsure(id, timedOut ? 'timeout' : 'model-error'));
    } finally {
      clearTimeout(timer);
    }
    if (replyOrTimeout === TIMED_OUT) {
      log({ outcome: 'timeout', ms: Date.now() - started });
      return ids.map((id) => unsure(id, 'timeout'));
    }

    const reply = replyOrTimeout;
    log({
      outcome: 'ok',
      ms: reply.ms,
      requestId: reply.requestId,
      model: reply.model,
      promptTokens: reply.promptTokens,
      outputTokens: reply.outputTokens,
    });
    const originalLines = input.source.replace(/\r\n?/g, '\n').split('\n');
    return validateAnswer(reply.text, ids, seen.lines, originalLines);
  };
}
