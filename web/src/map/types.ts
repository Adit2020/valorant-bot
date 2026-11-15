// Shared types for the Bind A map.

// RegionId has one source of truth: the Zod enum in shared/schema.ts. The LLM, the validator and the
// map all use it, so a region can't exist on the map but be rejected by the validator (or vice versa).
// bindA.test.ts checks that REGIONS covers exactly these ids.
export type { RegionId } from '../../../shared/schema.js';

export type Vec = [number, number];
export type Team = 'atk' | 'def';
export type Role = 'C' | 'D' | 'I' | 'S'; // controller, duelist, initiator, sentinel

/** One agent as the map should draw it this frame. Positions are world units (1000 x 700). */
export interface AgentView {
  id: string;
  tag: string; // short name tag, e.g. "RAZ" or "RELAI"
  team: Team;
  role: Role;
  x: number;
  y: number;
  /** Radians. 0 = facing east (+x), PI/2 = facing south (+y, down the screen). */
  facing: number;
  hp: number; // 0..100
  alive: boolean;
  isBrim?: boolean;
  hasSpike?: boolean;
  /** 0..1, how flashed the agent is right now (draws a white halo). */
  blind?: number;
  /** True while this agent's voice line is playing (draws an amber pulse). */
  speaking?: boolean;
}

export type SpikeView =
  | { state: 'carried' }
  | { state: 'dropped'; x: number; y: number }
  | { state: 'planting'; x: number; y: number; progress: number }
  | { state: 'planted'; x: number; y: number; plantedAt: number }
  | { state: 'defusing'; x: number; y: number; plantedAt: number; progress: number }
  | { state: 'defused'; x: number; y: number }
  | { state: 'detonated'; x: number; y: number };

export interface MapState {
  agents: AgentView[];
  spike: SpikeView;
}

/** Fire-and-forget effects. The map animates them from the sim time you pass to spawnEffect(). */
export type MapEffect =
  | { type: 'smoke'; from: Vec; to: Vec; duration?: number }
  | { type: 'molly'; from: Vec; to: Vec; duration?: number }
  | { type: 'flash'; from?: Vec; to: Vec }
  | { type: 'kill'; at: Vec; killer: string; victim: string; killerTeam: Team }
  | { type: 'ping'; at: Vec; label: string; team?: Team };

export interface MapOptions {
  /** Callout names on the floor. */
  showLabels: boolean;
  /** Region outlines, smoke targets, defender spots, see-through smokes. */
  designerView: boolean;
  /** Draw the walkable nav grid (debug). */
  showNav: boolean;
}
