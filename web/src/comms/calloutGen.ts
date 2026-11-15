import type { BrimEvent, RegionId, Sighting } from '../../../shared/schema.js';
import { REGION_BY_ID } from '../map/bindA.js';
import { regionAt } from '../map/geometry.js';
import type { AgentView } from '../map/types.js';
import { DT, STEP_MS } from '../sim/loop.js';

export interface EnemyCallout { sighting: Sighting; text: string }
export type PlaybackStage = 'started' | 'completed' | 'canceled' | 'failed';
const cooldown = 3000 / STEP_MS;
const numbers = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five'];

// One instance per round. Only the post-combat Brim perception pass feeds observe().
export class CalloutGenerator {
  private tick = 0;
  private visible = new Map<RegionId, Sighting>();
  private pending = new Map<RegionId, EnemyCallout>();
  // Retain the last spoken group only while each of its members stays in view.
  private reported = new Map<RegionId, Sighting>();
  private nextAllowed = new Map<RegionId, number>();
  private log: BrimEvent[] = [];

  events(): BrimEvent[] { return structuredClone(this.log); }

  observe(tick: number, contacts: readonly Pick<AgentView, 'id' | 'x' | 'y'>[]) {
    if (tick <= this.tick) return;
    this.tick = tick;
    const groups = new Map<RegionId, Set<string>>();
    for (const contact of contacts) {
      const region = regionAt(contact.x, contact.y);
      if (!region) continue;
      const ids = groups.get(region) ?? new Set<string>();
      ids.add(contact.id);
      groups.set(region, ids);
    }
    for (const region of this.visible.keys()) {
      if (!groups.has(region)) {
        this.drop(region, 'Contact lost');
        this.visible.delete(region);
        this.reported.delete(region);
      }
    }
    for (const [region, ids] of groups) {
      const defenderIds = [...ids].sort();
      const reported = this.reported.get(region);
      if (reported && !reported.defenderIds.every(id => ids.has(id))) this.reported.delete(region);
      const previous = this.visible.get(region);
      if (previous?.count === ids.size && previous.defenderIds.every(id => ids.has(id))) continue;
      this.drop(region, 'Visible defenders changed');
      const sighting = { id: tick + '/' + region, tick, region, defenderIds, count: ids.size };
      this.visible.set(region, sighting);
      this.log.push({ t: tick * DT, kind: 'saw', detail: defenderIds.join(', ') + ' at ' + region,
        sightingId: sighting.id, sighting });
      const text = (numbers[ids.size] ?? String(ids.size)) + ' ' + REGION_BY_ID[region].name + '.';
      const call = { sighting, text };
      this.event(call, 'generated', text);
      if (this.reported.get(region)?.count === ids.size) {
        this.event(call, 'skipped', 'Already reported these continuously visible defenders');
        continue;
      }
      this.pending.set(region, call); // bounded by the map's named regions
    }
  }

  isCurrent(sighting: Sighting) { return this.visible.get(sighting.region)?.id === sighting.id; }

  // Oldest still-confirmed change first. Simultaneous edges favor larger groups, then map ID.
  take(): EnemyCallout | undefined {
    const next = [...this.pending.values()]
      .filter(c => this.tick >= (this.nextAllowed.get(c.sighting.region) ?? 0))
      .sort((a,b) => a.sighting.tick - b.sighting.tick || b.sighting.count - a.sighting.count ||
        a.sighting.region.localeCompare(b.sighting.region))[0];
    if (next) {
      this.pending.delete(next.sighting.region);
      this.nextAllowed.set(next.sighting.region, this.tick + cooldown);
      this.event(next, 'scheduled', next.text);
    }
    return next;
  }

  playback(call: EnemyCallout, stage: PlaybackStage, detail = call.text) {
    if (stage === 'started') {
      this.nextAllowed.set(call.sighting.region, this.tick + cooldown);
      this.reported.set(call.sighting.region, call.sighting);
    }
    this.event(call, stage, detail);
  }

  discardPending(reason: string) {
    for (const region of this.pending.keys()) this.drop(region, reason);
  }

  private drop(region: RegionId, reason: string) {
    const call = this.pending.get(region);
    if (call) this.event(call, 'skipped', reason);
    this.pending.delete(region);
  }

  private event(call: EnemyCallout, stage: NonNullable<BrimEvent['calloutStage']>, detail: string) {
    this.log.push({ t: this.tick * DT, kind: stage === 'started' ? 'said' : 'decided',
      detail, sightingId: call.sighting.id, calloutStage: stage });
  }
}
