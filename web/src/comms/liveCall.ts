import { BrimResponseSchema, LiveResponseSchema, type BrimResponse, type GameStateForLLM } from '../../../shared/schema.js';
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

export async function liveReply(round: Round, roundId: number, mode: GameStateForLLM['mode'],
  transcript: string, signal: AbortSignal, record: (trace: CommandTrace) => void, classify = classifyLive): Promise<ReplyResult> {
  const controller = round.brim;
  const start = performance.now();
  const trace: CommandTrace = { roundId, t: round.time, path: 'keyword', goalIds: [], validator: { ok: false } };
  record(trace);
  function guard() {
    if (signal.aborted || controller !== round.brim) {
      trace.validator = { ok: false, reason: signal.aborted ? 'Cancelled' : 'Round changed' };
      throw new DOMException(trace.validator.reason, 'AbortError');
    }
  }
  function reject(reply: string, reason = reply, needs: BrimResponse['needs'] = null): ReplyResult {
    trace.validator = { ok: false, reason };
    trace.feedback = reply;
    return { source: trace.path === 'keyword' ? 'keyword' : 'local', response: response(reply, [], needs) };
  }
  try {
    guard();
    let problem = liveProblem(round);
    if (problem) return reject(problem);
    const match = matchKeyword(transcript);
    let value: BrimResponse;
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
      if (value.actions.length) {
        const named = namedTargets(transcript);
        const requested = value.actions.flatMap(a => 'target' in a ? [a.target] : []);
        if (requested.length !== named.length || requested.some((target, i) => target !== named[i]))
          return reject('Which targets, in order?', 'Model targets differ from transcript', 'target');
      }
    }
    trace.interpretation = BrimResponseSchema.parse(value);
    if (!value.actions.length && !trace.decision) {
      const clarification = trace.path === 'llm' && !value.needs ? "Didn't catch that." : value.reply;
      return reject(clarification, clarification, value.needs);
    }
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
