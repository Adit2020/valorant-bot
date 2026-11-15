import { BrimResponseSchema, LiveResponseSchema, type Action, type BrimResponse, type GameStateForLLM } from '../../../shared/schema.js';
import type { Round } from '../sim/round.js';
import type { CommandTrace } from '../trace/log.js';
import { classifyLive, type ReplyResult } from './brimClient.js';
import { matchKeyword, namedTargets, response } from './keywordMatcher.js';
import { acknowledge, gameState, liveProblem, validateActions, yourCall } from './validator.js';

// The conversation owns the parent signal. The classifier can neither see the
// controller nor enqueue, even if a transport ignores abort and resolves late.
async function interpret(transcript: string, state: GameStateForLLM, parent: AbortSignal, classify: typeof classifyLive) {
  const signal = AbortSignal.any([parent, AbortSignal.timeout(2000)]);
  let stop!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    stop = () => reject(signal.reason);
    signal.addEventListener('abort', stop, { once: true });
  });
  try {
    signal.throwIfAborted();
    const result = await Promise.race([classify(transcript, state, signal), aborted]);
    signal.throwIfAborted();
    return LiveResponseSchema.parse(result);
  } finally { signal.removeEventListener('abort', stop); }
}

/** Grounding for model output: its targets must be exactly the callouts the player said, in order. */
export function targetsMatchTranscript(transcript: string, actions: readonly Action[]) {
  const named = namedTargets(transcript);
  const requested = actions.flatMap(a => 'target' in a ? [a.target] : []);
  return requested.length === named.length && requested.every((target, i) => target === named[i]);
}

export interface LiveReplyOptions {
  /** Comparison bot: says "Copy." to everything, never pushes back, and enqueues whatever it parsed without validation. */
  plain?: boolean;
}
export const PLAIN_REPLY = 'Copy.';

export async function liveReply(round: Round, roundId: number, mode: GameStateForLLM['mode'],
  transcript: string, signal: AbortSignal, record: (trace: CommandTrace) => void, classify = classifyLive,
  options: LiveReplyOptions = {}): Promise<ReplyResult> {
  const controller = round.brim;
  const start = performance.now();
  const plain = !!options.plain;
  const trace: CommandTrace = { roundId, t: round.time, path: 'keyword', goalIds: [], validator: { ok: false } };
  if (plain) trace.plain = true;
  record(trace);
  function guard() {
    if (signal.aborted || controller !== round.brim) {
      trace.validator = { ok: false, reason: signal.aborted ? 'Cancelled' : 'Round changed' };
      throw new DOMException(trace.validator.reason, 'AbortError');
    }
  }
  function reject(reply: string, reason = reply, needs: BrimResponse['needs'] = null): ReplyResult {
    // The plain bot never pushes back: the reason stays in the trace, the player only hears "Copy."
    if (plain) { reply = PLAIN_REPLY; needs = null; }
    trace.validator = { ok: false, reason };
    trace.feedback = reply;
    return { source: trace.path === 'keyword' ? 'keyword' : 'local', response: response(reply, [], needs) };
  }
  // Plain bot: no validator, no plan accounting. Bad goals fail later in the controller, like a dumb bot.
  function obey(value: BrimResponse): ReplyResult {
    guard();
    for (const action of value.actions) {
      try { trace.goalIds.push(controller.addGoal(action, 'command')); } catch { /* closed controller: drop */ }
    }
    trace.validator = trace.goalIds.length ? { ok: true, reason: 'Plain bot: not validated' } : { ok: false, reason: 'Plain bot: no goal accepted' };
    trace.feedback = PLAIN_REPLY;
    return { source: trace.path === 'llm' ? 'openai' : 'keyword', response: response(PLAIN_REPLY) };
  }
  try {
    guard();
    let problem = liveProblem(round);
    if (problem) return reject(problem);
    const match = matchKeyword(transcript);
    let value: BrimResponse;
    if (match.kind === 'your-call' && plain) return reject(PLAIN_REPLY, 'Plain bot: no decision');
    if (match.kind === 'your-call') {
      const decision = yourCall(round);
      value = decision.value;
      trace.decision = decision.reason;
    } else if (match.kind === 'response') value = match.value;
    else {
      trace.path = 'llm';
      const state = gameState(round, mode);
      if (!state) return reject('Say again?', 'Unresolved current region');
      try { value = await interpret(transcript, state, signal, classify); }
      catch (error) {
        guard();
        const timeout = error instanceof Error && error.name === 'TimeoutError';
        return reject(timeout ? 'Say again?' : "Didn't catch that.", timeout ? 'LLM timeout' :
          error instanceof Error && ['ZodError','SyntaxError'].includes(error.name) ? 'Invalid model output' :
          error instanceof Error ? error.message : 'Live interpretation failed');
      }
      guard();
      problem = liveProblem(round);
      if (problem) return reject(problem);
      trace.interpretation = value;
      if (value.actions.length && !plain && !targetsMatchTranscript(transcript, value.actions))
        return reject('Which targets, in order?', 'Model targets differ from transcript', 'target');
    }
    trace.interpretation = BrimResponseSchema.parse(value);
    if (!value.actions.length && !trace.decision) {
      const clarification = trace.path === 'llm' && !value.needs ? "Didn't catch that." : value.reply;
      return reject(clarification, clarification, value.needs);
    }
    if (plain) return obey(value);
    const validation = validateActions(round, value.actions);
    if (validation.error) return reject(validation.error);
    // All checks and FIFO submissions happen synchronously in the same JS turn.
    guard();
    trace.goalIds = value.actions.map(a => controller.addGoal(a, 'command'));
    trace.validator = { ok: true };
    return { source: trace.path === 'llm' ? 'openai' : 'keyword',
      response: { ...value, reply: trace.decision ? value.reply : acknowledge(value, validation.covering) } };
  } finally {
    trace.thinkMs = performance.now() - start;
    if (controller === round.brim) trace.decisionTime = round.time;
  }
}
