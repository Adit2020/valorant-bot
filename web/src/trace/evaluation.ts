// Offline evidence only. A frame is the complete state at a change, valid up to the next change.
import { z } from 'zod';
import { RegionIdSchema } from '../../../shared/schema.js';
import { regionAt } from '../map/geometry.js';
import type { AgentView } from '../map/types.js';
import { publiclySeen } from '../sim/visibility.js';

const tick = z.number().int().nonnegative();
const defender = z.object({ id: z.string(), region: RegionIdSchema.nullable(), visible: z.boolean() });
export const EvaluationSchema = z.object({
  throughTick: tick,
  frames: z.array(z.object({ tick, defenders: z.array(defender) })).min(1),
}).refine(({ frames, throughTick }) => frames[0]?.tick === 0 && frames.every((frame, i) =>
  frame.tick <= throughTick && (!i || frame.tick > frames[i - 1]!.tick) &&
  new Set(frame.defenders.map(d => d.id)).size === frame.defenders.length));
export type Evaluation = z.infer<typeof EvaluationSchema>;
export type EvaluationFrame = Evaluation['frames'][number];

export class EvaluationRecorder {
  private frames: EvaluationFrame[] = [];
  private signature = '';
  private throughTick = 0;

  observe(tick: number, agents: readonly AgentView[], sight: Map<string, string[]>) {
    const defenders = agents.filter(a => a.team === 'def' && a.alive).map(a => ({
      id: a.id, region: regionAt(a.x, a.y), visible: publiclySeen(sight, a.id),
    }));
    this.throughTick = tick;
    const signature = JSON.stringify(defenders);
    if (this.signature === signature) return;
    this.signature = signature;
    this.frames.push({ tick, defenders });
  }

  export(): Evaluation { return { throughTick: this.throughTick, frames: structuredClone(this.frames) }; }
}
