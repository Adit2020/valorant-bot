import type { Action, BrimResponse, GameStateForLLM, RegionId } from '../../../shared/schema.js';
import { PLANT_SPOTS, REGION_BY_ID } from '../map/bindA.js';
import { findPath, hasLOS, inPlantZone, isOpen, regionAt } from '../map/geometry.js';
import type { Vec } from '../map/types.js';
import { plays, defaultPlay } from '../plays/index.js';
import { destination, plantCover } from '../sim/brim.js';
import { Round, smokeSpot } from '../sim/round.js';
import { response } from './keywordMatcher.js';

export function liveProblem(round: Round): string | undefined {
  if (round.phase !== 'live' || round.finished) return 'Round is not live.';
  if (round.brim.inspect().closed || !round.snapshot().agents.find(a => a.isBrim)?.alive) return 'RelAI is down.';
}

export function gameState(round: Round, mode: GameStateForLLM['mode']): GameStateForLLM | undefined {
  const snapshot = round.snapshot();
  const friends = snapshot.agents.filter(a => a.team === 'atk');
  const self = friends.find(a => a.isBrim)!;
  const region = regionAt(self.x, self.y);
  if (!region) return undefined;
  const groups = new Map<RegionId, number>();
  for (const contact of round.observations('brim')) {
    const id = regionAt(contact.x, contact.y);
    if (id) groups.set(id, (groups.get(id) ?? 0) + 1);
  }
  return {
    phase: snapshot.spike.state === 'planted' ? 'post_plant' : round.phase, t: round.time, mode, play: round.play,
    brim: { region, hasSpike: !!self.hasSpike, smokesLeft: round.smokesLeft, mollyLeft: round.mollyLeft },
    allies: friends.flatMap(a => {
      const location = regionAt(a.x, a.y);
      return !a.isBrim && location ? [{ name: a.id, region: location, alive: a.alive }] : [];
    }),
    knownEnemies: [...groups].map(([region, count]) => ({ region, count, secondsAgo: 0 })),
  };
}

export function yourCall(round: Round) {
  const contacts = round.observations('brim');
  for (const c of contacts) {
    const region = regionAt(c.x, c.y);
    if (region) return { value: response('Will watch ' + REGION_BY_ID[region].name + '.', [{ type: 'hold', target: region }]),
      reason: 'RelAI observed ' + c.id + ' at ' + region };
  }
  const state = round.brim.inspect();
  const current = state.queue.find(g => !state.cancelling.includes(g.id));
  if (current) return { value: response('Continuing the current order.'), reason: 'Continue goal #' + current.id };
  return { value: response('I’ll hold here and save utility.', [{ type: 'wait' }]), reason: 'No pending work or current contacts' };
}

export function validateActions(round: Round, actions: Action[]): { error?: string; covering?: string } {
  const problem = liveProblem(round);
  if (problem) return { error: problem };
  const state = round.brim.inspect();
  const pending = state.queue.filter(g => !state.cancelling.includes(g.id));
  const explicit = [...pending.filter(g => g.priority !== 'plan').map(g => g.action), ...actions];
  // A successful explicit deployment supersedes every outstanding identical plan cue.
  const remainingPlan = pending.filter(g => g.priority === 'plan' && !explicit.some(a =>
    a.type === g.action.type && 'target' in a && 'target' in g.action && a.target === g.action.target));
  for (const kind of ['smoke', 'molly'] as const) {
    if (!actions.some(a => a.type === kind)) continue;
    const needed = explicit.filter(a => a.type === kind).length + remainingPlan.filter(g => g.action.type === kind).length;
    if (needed > (kind === 'smoke' ? round.smokesLeft : round.mollyLeft))
      return { error: kind === 'smoke' ? 'Out of smokes.' : 'No molly available.' };
  }
  const snapshot = round.snapshot();
  const self = snapshot.agents.find(a => a.isBrim)!;
  let from: Vec = [self.x, self.y];
  const carrier = snapshot.agents.find(a => a.team === 'atk' && a.alive && a.hasSpike);
  const route = plays[round.play ?? defaultPlay].routes.find(r => r.id === 'brim')!;
  let covering: string | undefined;
  let plantPending = false;
  // Earlier commands can change the origin for a subsequent molly or move.
  for (const a of explicit) {
    let steps: Vec[] = [];
    switch (a.type) {
      case 'move': case 'hold': {
        const to = destination(a.target);
        if (!to) return { error: "Can't resolve that callout." };
        if (a.type === 'move') steps = [to];
        break;
      }
      case 'go': steps = route.waypoints; break;
      case 'fallback': steps = [route.start]; break;
      case 'plant': {
        if (!carrier || plantPending || !inPlantZone(...PLANT_SPOTS[a.target])) return { error: 'No valid plant available.' };
        if (!carrier.isBrim && a.target !== 'default') return { error: 'Our planter is going Default.' };
        if (!carrier.isBrim && actions.includes(a)) covering = carrier.id;
        steps = [carrier.isBrim ? PLANT_SPOTS[a.target] : plantCover[a.target]];
        plantPending = !!carrier.isBrim;
        break;
      }
      case 'smoke': {
        const to = smokeSpot(a.target);
        if (!to || !isOpen(...to)) return { error: "Can't place a smoke there." };
        break;
      }
      case 'molly': {
        const to = destination(a.target);
        if (!to || !isOpen(...to) || !hasLOS(from, to)) return { error: 'Molly path is blocked.' };
        break;
      }
    }
    for (const to of steps) {
      if (!findPath(from, to).length) return { error: "Can't reach that spot." };
      from = to;
    }
  }
  return { covering };
}

export function acknowledge(value: BrimResponse, covering?: string) {
  if (covering) return 'I’ll cover ' + covering.charAt(0).toUpperCase() + covering.slice(1) + ' at Default.';
  const [first] = value.actions;
  if (value.actions.length !== 1 || !first || !('target' in first)) return 'Command accepted.';
  const target = first.target === 'alt' ? 'Alt' : REGION_BY_ID[first.target].name;
  const verb = { move: 'Moving to', hold: 'Will watch', smoke: 'Will smoke', molly: 'Will molly', plant: 'Will plant' }[first.type];
  return verb + ' ' + target + '.';
}
