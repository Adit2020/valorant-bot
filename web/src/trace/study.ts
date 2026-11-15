// One protocol shared by the browser and offline audit. No participant registry or uploads.
import type { PlayId } from '../../../shared/schema.js';
import type { Mode } from '../sim/loop.js';
import type { BotKind, ConversationState } from './log.js';

export const PROTOCOL = 'relai-9a-v1' as const;
export const SCORING_VERSION = 2 as const;
export const PHASES = ['pre', 'prac1', 'prac2', 'prac3', 'prac4', 'post'] as const;
export type StudyPhase = typeof PHASES[number];
export type Condition = 'T' | 'C';
export type ScenarioOrder = 'AB' | 'BA';
export const SCENARIOS = {
  A: { scenarioId: 'A', seed: 91001, play: 'fast_rush', defenderSetup: 'standard-omen-cubby' },
  B: { scenarioId: 'B', seed: 91002, play: 'fast_rush', defenderSetup: 'standard-omen-triple' },
} as const;
export const PRACTICE = [
  { scenarioId: 'practice-1', seed: 81001, play: 'fast_plant' },
  { scenarioId: 'practice-2', seed: 81002, play: 'slow_push' },
  { scenarioId: 'practice-3', seed: 81003, play: 'fast_plant' },
  { scenarioId: 'practice-4', seed: 81004, play: 'slow_push' },
] as const;
export interface StudyConfig {
  protocol: typeof PROTOCOL;
  scoringVersion: typeof SCORING_VERSION;
  participantId: string;
  condition: Condition;
  dataKind: 'human' | 'fixture';
  phase: StudyPhase;
  order: ScenarioOrder;
  orderAssignment: 'default' | 'explicit' | 'balanced';
  scenarioId: string;
  seed: number;
  play: PlayId;
  mode: Mode;
  bot: BotKind;
  automaticCallouts: 'standard-perception';
  inputPolicy: 'local-text';
}
export function studyConfig(participantId: string, condition: string, phase: string, order = 'AB', dataKind = 'human', orderAssignment: StudyConfig['orderAssignment'] = 'explicit'): StudyConfig {
  if (!['human', 'fixture'].includes(dataKind)) throw new Error('data must be human or fixture.');
  if (!(dataKind === 'fixture' ? /^FIX\d{2,4}$/ : /^P\d{2,4}$/).test(participantId))
    throw new Error('Use an anonymous ID P01–P9999 (or FIX01 with data=fixture).');
  if (condition !== 'T' && condition !== 'C') throw new Error('group must be T (RelAI) or C (Plain).');
  if (!PHASES.includes(phase as StudyPhase)) throw new Error('phase must be pre, prac1, prac2, prac3, prac4, or post.');
  if (order !== 'AB' && order !== 'BA') throw new Error('order must be AB, BA, or balanced.');
  const evaluation = phase === 'pre' || phase === 'post';
  const scenario = evaluation ? SCENARIOS[(phase === 'pre' ? order[0] : order[1]) as 'A' | 'B'] : PRACTICE[Number(phase.slice(4)) - 1]!;
  return { protocol: PROTOCOL, scoringVersion: SCORING_VERSION, participantId, condition, dataKind: dataKind as StudyConfig['dataKind'],
    phase: phase as StudyPhase, order, orderAssignment, scenarioId: scenario.scenarioId, seed: scenario.seed, play: scenario.play,
    mode: evaluation || phase === 'prac3' || phase === 'prac4' ? 'match' : 'learn',
    bot: evaluation || condition === 'C' ? 'plain' : 'relai', automaticCallouts: 'standard-perception', inputPolicy: 'local-text' };
}
export function parseStudy(query: URLSearchParams): StudyConfig | undefined {
  if (!['participant', 'group', 'study', 'order', 'data'].some(key => query.has(key))) return;
  const participant = query.get('participant') ?? '';
  const requested = query.get('order') ?? 'AB';
  const order = requested === 'balanced' ? (Number(participant.replace(/^\D+/, '')) % 2 ? 'AB' : 'BA') : requested;
  const config = studyConfig(participant, query.get('group') ?? '', query.get('phase') ?? 'pre', order,
    query.get('data') ?? 'human', requested === 'balanced' ? 'balanced' : query.has('order') ? 'explicit' : 'default');
  for (const key of ['seed', 'bot', 'agentLab']) if (query.has(key)) throw new Error(`Remove ${key}: the study protocol selects it.`);
  return config;
}
export const isEvaluation = (config: StudyConfig) => config.phase === 'pre' || config.phase === 'post';
export const hideStudyResults = (config: StudyConfig) => isEvaluation(config) || config.condition === 'C';
/** Conversation lifecycle text must not reveal the private validator result during blinded/control play. */
export function participantStatus(state: ConversationState, message: string, feedbackHidden: boolean, error?: string): string {
  if (!feedbackHidden) return message;
  if (error) return error;
  return { idle: 'Ready for another call.', thinking: 'Processing call…', speaking: 'Teammate speaking.', listening: 'Listening…' }[state];
}
export function studyUrl(config: StudyConfig, phase: StudyPhase): string {
  const q = new URLSearchParams({ participant: config.participantId, group: config.condition, phase,
    order: config.orderAssignment === 'balanced' ? 'balanced' : config.order });
  if (config.orderAssignment === 'default') q.delete('order');
  if (config.dataKind === 'fixture') q.set('data', 'fixture');
  return '/?' + q;
}
