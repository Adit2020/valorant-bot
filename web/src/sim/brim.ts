// Fast layer: this module can see Brim, his own contacts, the spike carrier's ID,
// and static map geometry. It has no Round, roster, renderer or clock reference.
import { ActionSchema, type Action, type BrimEvent, type RegionId } from '../../../shared/schema.js';
import { PLANT_SPOTS, REGIONS } from '../map/bindA.js';
import { cellCenter, dist, inPlantZone, NAV, navOpen, regionAt } from '../map/geometry.js';
import type { AgentView, Vec } from '../map/types.js';
import { FAST_PLANT } from '../plays/fastPlant.js';
import { DT } from './loop.js';


// Offset holds leave the carrier's route free and have a clear line to the spot.
const cover: Record<keyof typeof PLANT_SPOTS, Vec> = { default: [540, 365], alt: [675, 275] };
const HOLD_TICKS = 20, STALL_TICKS = 60;
export const PLANT_TICKS = 80;

// Some callout labels are painted on solid cover. Choose the nearest legal
// cell belonging to that callout; row-major order breaks exact distance ties.
const destinations = new Map<RegionId, Vec>();
for (const region of REGIONS) {
  let best = Infinity;
  for (let j = 0; j < NAV.rows; j++) for (let i = 0; i < NAV.cols; i++) {
    if (!navOpen(i,j)) continue;
    const p = cellCenter(i,j), d = dist(p, region.label);
    if (d < best && regionAt(...p) === region.id) { destinations.set(region.id, p); best = d; }
  }
}
export function destination(region: RegionId): Vec | undefined {
  const p = destinations.get(region);
  return p && [...p];
}

type State = 'move' | 'hold' | 'smoke' | 'molly' | 'plant' | 'retreat';
type Status = 'queued' | 'active' | 'paused' | 'done' | 'failed' | 'cancelled';
export type Priority = 'plan' | 'command' | 'tactical';
const rank = { plan: 0, command: 1, tactical: 2 };
interface Goal {
  id: number; action: Action; priority: Priority; status: Status;
  elapsed: number; reason?: string; watch?: Vec; recovery?: boolean;
}
export interface BrimFrame {
  tick: number; pos: Vec; contacts: AgentView[]; carrier?: string;
  route(goals: Vec[]): boolean;
  watch(point: Vec): void;
  deploy(kind: 'smoke' | 'molly', target: RegionId): string | undefined;
  plant(progress: number): void;
  stopPlant(): void;
}

export class BrimController {
  constructor(private readonly script = FAST_PLANT.find(r => r.id === 'brim')!) {}
  private sequence = 0;
  private goals: Goal[] = [];
  private active?: Goal;
  private state: State = 'hold';
  private known = new Map<string, { region: RegionId | null; lastSeenTick: number; visible: boolean }>();
  private log: BrimEvent[] = [];
  private cancellations = new Map<number, string>();
  private leg?: { to: Vec; lastPos: Vec; movedAt: number };
  private failures = 0;
  private closed = false;
  private lastReaction = -Infinity;

  addGoal(action: Action, priority: Priority = 'command'): number {
    if (this.closed) throw new Error('Brim cannot accept goals after death or round end');
    const goal: Goal = { id: ++this.sequence, action: { ...action }, priority, status: 'queued', elapsed: 0 };
    this.goals.push(goal);
    return goal.id;
  }
  cancelGoal(id: number) { this.cancellations.set(id, 'cancelled'); }
  clearGoals() { for (const g of this.pending()) this.cancelGoal(g.id); }
  private pending() {
    return this.goals.filter(g => ['queued','paused','active'].includes(g.status))
      .sort((a,b) => rank[b.priority] - rank[a.priority] || a.id - b.id);
  }
  inspect() {
    return structuredClone({ state: this.state, activeId: this.active?.id ?? null,
      queue: this.pending(), goals: this.goals, destination: this.leg?.to ?? null,
      distanceToTarget: this.leg ? dist(this.leg.lastPos, this.leg.to) : null,
      knownEnemies: Object.fromEntries(this.known), closed: this.closed });
  }
  events(): BrimEvent[] { return this.log.map(e => ({ ...e })); }
  private emit(tick: number, kind: BrimEvent['kind'], detail: string) {
    this.log.push({ t: tick * DT, kind, detail });
  }
  private enter(f: BrimFrame, next: State) {
    if (this.state !== next) this.emit(f.tick, 'decided', 'state: ' + next);
    this.state = next;
  }
  private release(f: BrimFrame) {
    f.route([]); f.stopPlant();
    this.leg = undefined;
    this.active = undefined;
  }
  close(f: BrimFrame, reason: string) {
    if (this.closed) return;
    for (const g of this.pending()) {
      g.status = 'cancelled'; g.reason = reason;
      this.emit(f.tick, 'decided', '#' + g.id + ' cancelled: ' + reason);
    }
    for (const k of this.known.values()) k.visible = false;
    this.release(f); this.state = 'hold'; this.closed = true;
  }

  private observe(f: BrimFrame) {
    const visible = new Set(f.contacts.map(c => c.id));
    for (const [id, k] of this.known) if (k.visible && !visible.has(id)) {
      k.visible = false; this.emit(f.tick, 'saw', 'lost sight of ' + id);
    }
    let first: AgentView | undefined;
    for (const c of f.contacts) {
      const region = regionAt(c.x, c.y);
      if (!this.known.get(c.id)?.visible) {
        this.emit(f.tick, 'saw', c.id + ' at ' + (region ?? 'unknown'));
        first ??= c;
      }
      this.known.set(c.id, { region, lastSeenTick: f.tick, visible: true });
    }
    if (first && f.tick - this.lastReaction >= HOLD_TICKS && !this.pending().some(g => g.priority === 'tactical')) {
      this.lastReaction = f.tick;
      const id = this.addGoal({ type: 'wait' }, 'tactical');
      this.goals.at(-1)!.watch = [first.x, first.y];
      this.emit(f.tick, 'decided', '#' + id + ' hold angle on visible ' + first.id);
    }
  }

  private finish(f: BrimFrame, ok: boolean, detail: string) {
    const g = this.active!;
    g.status = ok ? 'done' : 'failed'; g.reason = detail;
    this.emit(f.tick, ok ? 'did' : 'decided', '#' + g.id + (ok ? ' ' : ' rejected: ') + detail);
    this.release(f);
    this.failures = ok ? 0 : this.failures + 1;
    if (!ok && !g.recovery && (this.failures >= 2 || detail === 'no movement progress' || !this.pending().length)) {
      // Abandon stale work; attempt the scripted route once. A blocked fallback holds.
      this.clearGoals();
      const id = this.addGoal({ type: 'go' }, 'plan');
      this.goals.at(-1)!.recovery = true;
      this.emit(f.tick, 'decided', '#' + id + ' fall back to scripted route');
      this.failures = 0;
    }
  }

  // Only install a route at entry/resume. moveAgent owns every position change.
  private arrive(f: BrimFrame, to: Vec, via: Vec[] = [to]): boolean {
    if (dist(f.pos, to) < 0.001) return true;
    if (!this.leg) {
      if (!f.route(via)) { this.finish(f, false, 'unreachable destination'); return false; }
      this.leg = { to, lastPos: f.pos, movedAt: f.tick };
    } else if (dist(f.pos, this.leg.lastPos) > 0.001) {
      this.leg.lastPos = f.pos; this.leg.movedAt = f.tick;
    } else if (f.tick - this.leg.movedAt >= STALL_TICKS) {
      this.finish(f, false, 'no movement progress');
    }
    return false;
  }

  step(f: BrimFrame) {
    if (this.closed) return;
    for (const [id, reason] of this.cancellations) {
      const g = this.goals.find(goal => goal.id === id);
      if (!g || (g.status !== 'active' && g.status !== 'queued' && g.status !== 'paused')) continue;
      if (g === this.active) this.release(f);
      g.status = 'cancelled'; g.reason = reason;
      this.emit(f.tick, 'decided', '#' + g.id + ' ' + reason);
    }
    this.cancellations.clear();
    this.observe(f);
    const next = this.pending()[0];
    if (!next) { this.enter(f, 'hold'); return; }
    if (next !== this.active) {
      if (this.active) {
        this.active.status = 'paused';
        this.emit(f.tick, 'decided', '#' + this.active.id + ' paused for #' + next.id);
        this.release(f);
      }
      const resumed = next.status === 'paused';
      this.active = next; next.status = 'active';
      // Planting must be uninterrupted. A finite hold retains time already served.
      if (next.action.type === 'plant') next.elapsed = 0;
      this.emit(f.tick, 'decided', '#' + next.id + (resumed ? ' resume ' : ' start ') +
        next.action.type + ('target' in next.action ? ' ' + next.action.target : ''));
      if (!ActionSchema.safeParse(next.action).success) { this.finish(f, false, 'invalid action or target'); return; }
    }
    const a = next.action;
    switch (a.type) {
      case 'smoke': case 'molly': {
        this.enter(f, a.type);
        const error = f.deploy(a.type, a.target);
        // An explicit deployment can fulfil the same outstanding play cue.
        // Distinct explicit commands still represent distinct deployments.
        if (!error && next.priority !== 'plan') {
          for (const g of this.pending()) if (g.priority === 'plan' && g.action.type === a.type &&
            'target' in g.action && g.action.target === a.target) {
            this.cancellations.set(g.id, 'superseded by deployment #' + next.id);
          }
        }
        this.finish(f, !error, error ?? ('deployed ' + a.type + ' at ' + a.target)); return;
      }
      case 'move': case 'go': case 'fallback': {
        const to = 'target' in a ? destination(a.target) :
          a.type === 'go' ? this.script.waypoints.at(-1)! : this.script.start;
        this.enter(f, a.type === 'fallback' ? 'retreat' : 'move');
        if (!to) { this.finish(f, false, 'no navigable target'); return; }
        if (this.arrive(f, to, a.type === 'go' ? this.script.waypoints : [to]))
          this.finish(f, true, 'reached ' + ('target' in a ? a.target : a.type === 'go' ? 'scripted hold' : 'spawn'));
        return;
      }
      case 'hold': case 'wait': {
        this.enter(f, 'hold');
        const at = next.watch ?? (a.type === 'hold' ? destination(a.target) : f.pos);
        if (!at) { this.finish(f, false, 'invalid watch angle'); return; }
        if (a.type === 'hold' || next.watch) f.watch(at);
        if (++next.elapsed >= HOLD_TICKS) this.finish(f, true, 'held angle');
        return;
      }
      case 'plant': {
        if (!f.carrier) { this.finish(f, false, 'no living spike carrier'); return; }
        const spot = PLANT_SPOTS[a.target];
        const carrying = f.carrier === 'brim';
        const to = carrying ? spot : cover[a.target];
        if (!carrying && !this.leg && !next.elapsed)
          this.emit(f.tick, 'decided', '#' + next.id + ' cover ' + f.carrier + ' at ' + a.target);
        if (dist(f.pos, to) >= 0.001) {
          this.enter(f, 'move'); this.arrive(f, to); return;
        }
        if (!carrying) {
          this.enter(f, 'hold'); f.watch(spot);
          if (++next.elapsed >= HOLD_TICKS) this.finish(f, true, 'covered ' + f.carrier + ' at ' + a.target);
          return;
        }
        if (!inPlantZone(...f.pos)) { this.finish(f, false, 'outside plant zone'); return; }
        this.enter(f, 'plant');
        if (!next.elapsed) this.emit(f.tick, 'did', '#' + next.id + ' planting ' + a.target);
        f.plant(next.elapsed / PLANT_TICKS);
        if (next.elapsed++ === PLANT_TICKS) this.finish(f, true, 'planted ' + a.target);
        return;
      }
    }
  }
  get currentState() { return this.state; }
}
