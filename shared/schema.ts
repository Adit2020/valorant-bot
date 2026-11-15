import { z } from 'zod';

// Bind A callouts, matching the regions drawn in web/src/map/bindA.ts (the map imports this type).
// Teleporters are left out for now, so there is no 'tp'; players saying "tp" map to a_short via CALLOUT_ALIASES.
export const RegionIdSchema = z.enum([
  'a_ct', 'heaven', 'vent', 'back_site', 'uhall', 'pillar', 'truck', 'triple',
  'default', 'tower', 'showers', 'a_short', 'cubby', 'a_lobby', 'a_link',
]);
export type RegionId = z.infer<typeof RegionIdSchema>;

export const ActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.enum(['smoke', 'molly']), target: RegionIdSchema }),
  z.strictObject({ type: z.literal('plant'), target: z.enum(['default', 'alt']) }),
  z.strictObject({ type: z.enum(['move', 'hold']), target: RegionIdSchema }),
  z.strictObject({ type: z.enum(['go', 'wait', 'fallback']) }),
]);
export type Action = z.infer<typeof ActionSchema>;

export const BrimResponseSchema = z.strictObject({
  reply: z.string().trim().min(1).max(240).refine(s => s.split(/\s+/u).length <= 12),
  actions: z.array(ActionSchema),
  needs: z.enum(['target', 'site', 'count']).nullable(),
});
export type BrimResponse = z.infer<typeof BrimResponseSchema>;

export const PlayIdSchema = z.enum(['fast_plant', 'fast_rush', 'slow_push']);
export type PlayId = z.infer<typeof PlayIdSchema>;
export const BuyCallSchema = z.strictObject({ play: PlayIdSchema.nullable() });
export const BuyRequestSchema = z.strictObject({ transcript: z.string().trim().min(1).max(2000) });

export const GameStateForLLMSchema = z.strictObject({
  phase: z.enum(['buy', 'live', 'post_plant']),
  t: z.number(),
  mode: z.enum(['learn', 'match']),
  brim: z.strictObject({
    region: RegionIdSchema,
    smokesLeft: z.number(),
    mollyLeft: z.number(),
    hasSpike: z.boolean(),
  }),
  allies: z.array(z.strictObject({ name: z.string(), region: RegionIdSchema, alive: z.boolean() })),
  knownEnemies: z.array(z.strictObject({ region: RegionIdSchema, count: z.number(), secondsAgo: z.number() })),
  play: PlayIdSchema.nullable(),
});
export type GameStateForLLM = z.infer<typeof GameStateForLLMSchema>;

export const TurnLogSchema = z.strictObject({
  t: z.number(),
  transcript: z.string(),
  path: z.enum(['keyword', 'llm']),
  response: BrimResponseSchema,
  validator: z.strictObject({ ok: z.boolean(), reason: z.string().optional() }),
  latencyMs: z.strictObject({ stt: z.number(), think: z.number(), firstAudio: z.number() }),
});
export type TurnLog = z.infer<typeof TurnLogSchema>;

export const SightingSchema = z.strictObject({
  id: z.string(), tick: z.number().int(), region: RegionIdSchema,
  defenderIds: z.array(z.string()).min(1), count: z.number().int().positive(),
});
export type Sighting = z.infer<typeof SightingSchema>;

export const BrimEventSchema = z.strictObject({
  t: z.number(), kind: z.enum(['saw', 'decided', 'said', 'did']), detail: z.string(),
  goalId: z.number().int().positive().optional(),
  goalStage: z.enum(['started', 'paused', 'resumed', 'completed', 'failed', 'cancelled', 'superseded']).optional(),
  sightingId: z.string().optional(), sighting: SightingSchema.optional(),
  calloutStage: z.enum(['generated', 'scheduled', 'started', 'completed', 'canceled', 'failed', 'skipped']).optional(),
});
export type BrimEvent = z.infer<typeof BrimEventSchema>;

// Existing text-only callers remain valid; context is optional until simulation exists.
export const BrimRequestSchema = z.strictObject({
  transcript: z.string().trim().min(1).max(2000),
  gameState: GameStateForLLMSchema.optional(),
});
export type BrimRequest = z.infer<typeof BrimRequestSchema>;

export const HealthResponseSchema = z.strictObject({ status: z.literal('ok') });

export const TtsRequestSchema = z.strictObject({ text: z.string().trim().min(1).max(240) });

// Model dialogue is a bounded vocabulary. The client phrases accepted actions from
// validated intent and the current carrier. Free-form model claims never reach TTS.
export const LiveResponseSchema = BrimResponseSchema.extend({
  reply: z.enum(['Command accepted.', 'Which target?', 'Which site?', 'How many?', "Didn't catch that."]),
}).refine(r => {
  if (r.actions.length) return r.needs === null && r.reply === 'Command accepted.';
  if (r.needs === null) return r.reply === "Didn't catch that.";
  const question = { target: 'Which target?', site: 'Which site?', count: 'How many?' };
  return r.reply === question[r.needs];
}, 'Dialogue and actions must agree');
