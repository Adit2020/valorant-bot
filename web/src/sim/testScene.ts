// A hard-coded 20-second "Fast plant" round to test the map (Step 2's "done when").
// This is NOT the real sim. Step 3 replaces it with the tick-based game loop and Brim's live agent,
// which produce the same MapState + MapEffect objects, so ui/mapPanel.ts only swaps its source.
// Imports avoid map/index.ts so this file (and its test) stays free of DOM/canvas code.

import { PLANT_SPOTS, SMOKE_TARGETS } from '../map/bindA.js';
import type { AgentView, MapEffect, MapState, Role, Team, Vec } from '../map/types.js';

interface Key {
  t: number;
  p: Vec;
  face?: Vec;
}

interface AgentScript {
  id: string;
  tag: string;
  team: Team;
  role: Role;
  isBrim?: boolean;
  keys: Key[];
  deathT?: number;
  hp?: { t: number; hp: number }[];
  blind?: [number, number][];
  speaking?: [number, number][];
  aim?: { t0: number; t1: number; at: Vec }[];
}

export interface SceneEvent {
  t: number;
  effect: MapEffect;
  by?: string;
}

export interface SceneLine {
  t0: number;
  t1: number;
  who: string;
  text: string;
}

export interface Scene {
  duration: number;
  plantStart: number;
  plantDuration: number;
  events: SceneEvent[];
  lines: SceneLine[];
  stateAt(t: number): MapState;
  brimSmokesLeft(t: number): number;
  lineAt(t: number): SceneLine | null;
}

const OMEN_DEATH: Vec = [565, 258];
const VIPER_DEATH: Vec = [685, 406];
const CHAMBER_POS: Vec = [565, 220]; // back site
const TOWER_SPOT: Vec = [710, 420];

const SCRIPTS: AgentScript[] = [
  // ---------- attackers (Fast plant: 3 up A Short, 2 through Showers) ----------
  {
    id: 'brim', tag: 'BRM', team: 'atk', role: 'C', isBrim: true,
    keys: [{ t: 0, p: [365, 639] }, { t: 0.9, p: [365, 558] }, { t: 2.2, p: [378, 473], face: [490, 420] }, { t: 7.9, p: [378, 473] }, { t: 8.6, p: [478, 464] }, { t: 9.1, p: [509, 420] }, { t: 10.2, p: [602, 410], face: [565, 258] }],
    aim: [
      { t0: 4.0, t1: 4.65, at: SMOKE_TARGETS.heaven.at },
      { t0: 4.65, t1: 5.3, at: SMOKE_TARGETS.uhall.at },
      { t0: 7.2, t1: 7.9, at: TOWER_SPOT },
      { t0: 16.0, t1: 16.8, at: OMEN_DEATH },
    ],
    speaking: [[3.6, 5.3], [14.4, 15.4], [17.1, 18.6]],
  },
  {
    id: 'raze', tag: 'RAZ', team: 'atk', role: 'D',
    keys: [{ t: 0, p: [405, 658] }, { t: 1.0, p: [405, 568] }, { t: 2.6, p: [372, 514] }, { t: 3.6, p: [412, 483], face: [490, 433] }, { t: 6.6, p: [412, 483] }, { t: 7.2, p: [490, 433] }, { t: 8.0, p: [565, 406], face: [565, 220] }, { t: 9.0, p: [565, 296] }, { t: 9.8, p: [602, 264], face: [715, 196] }],
    hp: [{ t: 8.45, hp: 64 }],
    aim: [{ t0: 8.0, t1: 8.65, at: CHAMBER_POS }],
  },
  {
    id: 'sova', tag: 'SOV', team: 'atk', role: 'I',
    // plants default, then steps off the spike so the planted pulse is visible
    keys: [{ t: 0, p: [372, 683] }, { t: 2.0, p: [372, 596] }, { t: 4.0, p: [365, 508], face: [490, 433] }, { t: 9.6, p: [365, 508] }, { t: 10.1, p: [478, 468] }, { t: 10.8, p: [546, 398] }, { t: 11.2, p: [565, 373], face: [715, 233] }, { t: 15.2, p: [565, 373] }, { t: 15.9, p: [534, 383], face: [715, 233] }],
  },
  {
    id: 'skye', tag: 'SKY', team: 'atk', role: 'I',
    keys: [{ t: 0, p: [778, 668] }, { t: 1.5, p: [778, 570] }, { t: 4.2, p: [740, 502], face: [665, 483] }, { t: 6.7, p: [740, 502] }, { t: 7.2, p: [684, 489] }, { t: 8.2, p: [655, 439], face: [710, 420] }, { t: 9.8, p: [655, 439], face: [715, 233] }],
    aim: [{ t0: 8.8, t1: 9.25, at: VIPER_DEATH }],
  },
  {
    id: 'cypher', tag: 'CYP', team: 'atk', role: 'S',
    keys: [{ t: 0, p: [810, 676] }, { t: 1.8, p: [810, 583] }, { t: 4.8, p: [815, 498], face: [665, 483] }, { t: 8.0, p: [815, 498] }, { t: 8.8, p: [640, 489] }, { t: 9.5, p: [630, 456], face: [565, 258] }],
  },
  // ---------- defenders ----------
  { id: 'jett', tag: 'JET', team: 'def', role: 'D', keys: [{ t: 0, p: [655, 158], face: [565, 420] }] },
  { id: 'kj', tag: 'KJ', team: 'def', role: 'S', keys: [{ t: 0, p: [340, 328], face: [315, 383] }] },
  { id: 'chamber', tag: 'CHA', team: 'def', role: 'S', keys: [{ t: 0, p: [565, 220], face: [478, 458] }], deathT: 8.6 },
  {
    id: 'viper', tag: 'VIP', team: 'def', role: 'C',
    keys: [{ t: 0, p: [710, 420], face: [665, 483] }, { t: 7.9, p: [710, 420] }, { t: 8.6, p: [685, 406], face: [655, 439] }],
    blind: [[6.75, 7.9]],
    hp: [{ t: 8.1, hp: 72 }],
    deathT: 9.2,
  },
  {
    id: 'omen', tag: 'OMN', team: 'def', role: 'C',
    keys: [{ t: 0, p: [415, 96], face: [360, 196] }, { t: 13.0, p: [415, 96] }, { t: 13.5, p: [360, 138] }, { t: 14.0, p: [360, 220] }, { t: 14.4, p: [420, 228] }, { t: 14.9, p: [502, 228] }, { t: 15.4, p: [565, 258], face: [602, 410] }],
    deathT: 16.6,
  },
];

const PLANT_START = 11.2;
const PLANT_DURATION = 4;

function lerp(a: Vec, b: Vec, q: number): Vec {
  return [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q];
}

function posAt(s: AgentScript, tIn: number): Vec {
  const t = s.deathT !== undefined ? Math.min(tIn, s.deathT) : tIn;
  const k = s.keys;
  const first = k[0]!; // every script has at least one key
  if (t <= first.t) return first.p;
  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i]!;
    const b = k[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      return lerp(a.p, b.p, span > 0 ? (t - a.t) / span : 1);
    }
  }
  return k[k.length - 1]!.p;
}

function facingAt(s: AgentScript, tIn: number): number {
  const t = s.deathT !== undefined ? Math.min(tIn, s.deathT) : tIn;
  const p = posAt(s, t);
  const aim = s.aim?.find((w) => t >= w.t0 && t <= w.t1);
  if (aim) return Math.atan2(aim.at[1] - p[1], aim.at[0] - p[0]);
  const k = s.keys;
  for (let i = 0; i < k.length - 1; i++) {
    const ka = k[i]!;
    const kb = k[i + 1]!;
    const a = ka.p;
    const b = kb.p;
    if (t > ka.t && t < kb.t && (a[0] !== b[0] || a[1] !== b[1])) return Math.atan2(b[1] - a[1], b[0] - a[0]);
  }
  for (let i = k.length - 1; i >= 0; i--) {
    const key = k[i]!;
    const f = key.face;
    if (key.t <= t && f) return Math.atan2(f[1] - p[1], f[0] - p[0]);
  }
  return -Math.PI / 2;
}

function windowValue(ws: [number, number][] | undefined, t: number): number {
  const w = ws?.find(([a, b]) => t >= a && t <= b);
  if (!w) return 0;
  const q = (t - w[0]) / (w[1] - w[0]);
  return 1 - q * q;
}

export function createTestScene(): Scene {
  const byId = new Map(SCRIPTS.map((s) => [s.id, s]));
  const from = (id: string, t: number) => {
    const script = byId.get(id);
    if (!script) throw new Error(`Unknown agent in test scene: ${id}`);
    return posAt(script, t);
  };

  const events: SceneEvent[] = [
    { t: 3.7, effect: { type: 'ping', at: SMOKE_TARGETS.heaven.at, label: 'Smoking Heaven' } },
    { t: 4.4, by: 'brim', effect: { type: 'smoke', from: from('brim', 4.4), to: SMOKE_TARGETS.heaven.at } },
    { t: 4.95, by: 'brim', effect: { type: 'smoke', from: from('brim', 4.95), to: SMOKE_TARGETS.uhall.at } },
    { t: 6.4, by: 'skye', effect: { type: 'flash', from: from('skye', 6.4), to: [690, 427] } },
    { t: 7.2, effect: { type: 'ping', at: TOWER_SPOT, label: 'One Tower', team: 'atk' } },
    { t: 7.6, by: 'brim', effect: { type: 'molly', from: from('brim', 7.6), to: TOWER_SPOT } },
    { t: 8.0, effect: { type: 'ping', at: CHAMBER_POS, label: 'One Back Site', team: 'atk' } },
    { t: 8.6, effect: { type: 'kill', at: CHAMBER_POS, killer: 'RAZ', victim: 'CHA', killerTeam: 'atk' } },
    { t: 9.2, effect: { type: 'kill', at: VIPER_DEATH, killer: 'SKY', victim: 'VIP', killerTeam: 'atk' } },
    { t: 14.4, effect: { type: 'ping', at: [420, 228], label: 'One Vent' } },
    { t: 16.6, effect: { type: 'kill', at: OMEN_DEATH, killer: 'BRM', victim: 'OMN', killerTeam: 'atk' } },
  ];

  const lines: SceneLine[] = [
    { t0: 3.6, t1: 5.3, who: 'Brim', text: 'Smoking Heaven and U-Hall.' },
    { t0: 7.2, t1: 8.0, who: 'Skye', text: 'One Tower.' },
    { t0: 8.0, t1: 8.9, who: 'Raze', text: 'One back site.' },
    { t0: 11.2, t1: 12.4, who: 'Sova', text: 'Planting default.' },
    { t0: 14.4, t1: 15.4, who: 'Brim', text: 'One Vent, rotating.' },
    { t0: 17.1, t1: 18.6, who: 'Brim', text: "Spike's down. Play time, rookie." },
  ];

  function stateAt(t: number): MapState {
    const agents: AgentView[] = SCRIPTS.map((s) => {
      const [x, y] = posAt(s, t);
      const alive = s.deathT === undefined || t < s.deathT;
      const hpEv = s.hp?.filter((h) => h.t <= t).pop();
      return {
        id: s.id,
        tag: s.tag,
        team: s.team,
        role: s.role,
        x,
        y,
        facing: facingAt(s, t),
        hp: alive ? (hpEv?.hp ?? 100) : 0,
        alive,
        isBrim: s.isBrim,
        hasSpike: s.id === 'sova' && t < PLANT_START,
        blind: windowValue(s.blind, t),
        speaking: !!s.speaking?.some(([a, b]) => t >= a && t <= b),
      };
    });
    const [px, py] = PLANT_SPOTS.default;
    const spike: MapState['spike'] =
      t < PLANT_START
        ? { state: 'carried' }
        : t < PLANT_START + PLANT_DURATION
          ? { state: 'planting', x: px, y: py, progress: (t - PLANT_START) / PLANT_DURATION }
          : { state: 'planted', x: px, y: py, plantedAt: PLANT_START + PLANT_DURATION };
    return { agents, spike };
  }

  return {
    duration: 20,
    plantStart: PLANT_START,
    plantDuration: PLANT_DURATION,
    events,
    lines,
    stateAt,
    brimSmokesLeft: (t) => 3 - events.filter((e) => e.by === 'brim' && e.effect.type === 'smoke' && e.t <= t).length,
    lineAt: (t) => lines.find((l) => t >= l.t0 && t <= l.t1 + 1.2) ?? null,
  };
}
