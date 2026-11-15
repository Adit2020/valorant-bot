import type { BrimEvent, BrimResponse, TurnLog } from '../../../shared/schema.js';

export type ConversationState = 'idle' | 'listening' | 'thinking' | 'speaking';
export interface CommandTrace {
  roundId: number;
  t: number;
  path: TurnLog['path'];
  goalIds: number[];
  validator: TurnLog['validator'];
  interpretation?: BrimResponse;
  decision?: string;
  feedback?: string;
  decisionTime?: number;
  thinkMs?: number;
  /** Set when the comparison plain bot handled this call (no validation, always "Copy."). */
  plain?: boolean;
}
export interface RoundTrace {
  roundId: number;
  seed: number;
  events: BrimEvent[];
  end: 'restart' | 'current';
}
export interface ConversationRecord {
  id: number;
  t: number;
  input: 'voice' | 'text' | 'round' | 'chip' | 'callout';
  transcript: string;
  source: 'local' | 'openai' | 'keyword' | 'round' | null;
  audio: 'hosted-stream' | 'hosted-buffered' | 'browser' | null;
  status: 'pending' | 'completed' | 'failed' | 'interrupted';
  response?: BrimResponse;
  latencyMs: { stt: number | null; think: number | null; firstAudio: number | null };
  error?: string;
  notices: string[];
  turnLog?: TurnLog;
  command?: CommandTrace;
  callout?: { roundId: number; sightingId: string };
}

export function attachTurnLog(record: ConversationRecord): void {
  const { stt, think, firstAudio } = record.latencyMs;
  // The existing contract has no local path or N/A numbers. Preserve it exactly.
  if (record.status === 'completed' && (record.command || record.source === 'openai' || record.source === 'keyword') && record.response &&
      stt !== null && think !== null && firstAudio !== null) {
    record.turnLog = {
      t: record.command?.t ?? record.t, transcript: record.transcript, path: record.command?.path ?? (record.source === 'keyword' ? 'keyword' : 'llm'), response: record.response,
      validator: record.command?.validator ?? { ok: true }, latencyMs: { stt, think, firstAudio },
    };
  }
}

export type BotKind = 'relai' | 'plain';
export interface TraceFile { version: 2; scope: 'gameplay'; bot?: BotKind; records: ConversationRecord[]; rounds: RoundTrace[] }

export function downloadTrace(records: ConversationRecord[], rounds: RoundTrace[], bot: BotKind = 'relai'): void {
  const file: TraceFile = { version: 2, scope: 'gameplay', bot, records, rounds };
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `relai-trace-${bot}-seed${rounds.at(-1)?.seed ?? 'unknown'}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
