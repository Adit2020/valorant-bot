import type { BrimEvent, BrimResponse, PlayId, TurnLog } from '../../../shared/schema.js';

import type { Round } from '../sim/round.js';
import type { Evaluation } from './evaluation.js';
import type { StudyConfig } from './study.js';
import type { Mode } from '../sim/loop.js';

export type ConversationState = 'idle' | 'listening' | 'thinking' | 'speaking';
export interface CommandTrace {
  roundId: number;
  t: number;
  path: TurnLog['path'];
  goalIds: number[];
  validator: TurnLog['validator'];
  inPlay?: boolean;
  report?: boolean;
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
  result?: NonNullable<Round['result']>;
  evaluation?: Evaluation;
  designerExposed?: boolean;
  play?: PlayId | null;
  mode?: Mode;
  completion?: 'complete' | 'incomplete' | 'aborted';
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
  buyCall?: { roundId: number; play?: PlayId };
  speechRelease?: { roundId: number; tick: number };
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
export interface StudySession extends StudyConfig {
  sessionId: string;
  startedAt: string;
  exportedAt: string;
  completion: 'complete' | 'incomplete' | 'aborted';
}
export interface TraceFile { version: 2 | 3; scope: 'gameplay'; bot?: BotKind; study?: StudySession; records: ConversationRecord[]; rounds: RoundTrace[] }

export function traceFilename(file: TraceFile, downloadNumber = 1): string {
  if (file.study) {
    const s = file.study;
    return `${s.participantId}-${s.condition}-${s.phase}--${s.sessionId}--${downloadNumber}.json`;
  }
  return `relai-trace-${file.bot ?? 'relai'}-seed${file.rounds.at(-1)?.seed ?? 'unknown'}.json`;
}

export function createStudyTrace(records: ConversationRecord[], rounds: RoundTrace[], config: StudyConfig,
  sessionId: string, startedAt: string, exportedAt = new Date().toISOString()): TraceFile {
  const round = rounds.at(-1);
  if (!round) throw new Error('No round to export.');
  const completion = round.result ? 'complete' : round.end === 'restart' ? 'aborted' : 'incomplete';
  return { version: 3, scope: 'gameplay', bot: config.bot,
    study: { ...config, sessionId, startedAt, exportedAt, completion },
    // Exactly one study round per file; restarts in ordinary gameplay remain compatible.
    rounds: [{ ...round, completion }],
    records: records.filter(r => {
      const id = r.command?.roundId ?? r.buyCall?.roundId ?? r.callout?.roundId ?? r.speechRelease?.roundId;
      return id === undefined || id === round.roundId;
    }) };
}

export function downloadTrace(records: ConversationRecord[], rounds: RoundTrace[], bot: BotKind = 'relai', study?: TraceFile, downloadNumber = 1): string {
  const file: TraceFile = study ?? { version: 3, scope: 'gameplay', bot, records, rounds };
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = traceFilename(file, downloadNumber);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return link.download;
}
