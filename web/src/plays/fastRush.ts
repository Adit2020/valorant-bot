import { PLANT_SPOTS } from '../map/bindA.js';
import type { Vec } from '../map/types.js';
import { FAST_PLANT, type Play } from './fastPlant.js';

// Stage the entire team in A Lobby before tick one. Raze leads the left lane.
const lanes: Record<string, { start: Vec; waypoints: Vec[]; speed: number; delayTicks: number }> = {
  raze: { start: [775, 600], waypoints: [[770, 483], [643, 480], [652, 360]], speed: 98, delayTicks: 0 },
  skye: { start: [800, 615], waypoints: [[804, 506], [667, 502], [678, 395]], speed: 92, delayTicks: 2 },
  brim: { start: [775, 635], waypoints: [[775, 493], [645, 488], [649, 413]], speed: 88, delayTicks: 0 },
  sova: { start: [800, 655], waypoints: [[802, 515], [650, 508], PLANT_SPOTS.default], speed: 84, delayTicks: 6 },
  cypher: { start: [775, 675], waypoints: [[780, 488], [675, 483], [670, 445]], speed: 81, delayTicks: 10 },
};
export const fastRush: Play = {
  id: 'fast_rush', name: 'Fast Rush', carrier: 'sova',
  routes: FAST_PLANT.map(route => ({ ...route, ...lanes[route.id]! })),
  goals: [{ type: 'move', target: 'showers' }, { type: 'move', target: 'tower' }, { type: 'plant', target: 'default' }],
  utility: 'No opening smokes. Prioritize movement behind the entry.',
  explanation: 'All five stage in A Lobby and enter through Showers behind Raze.',
  confirmation: 'Rush Showers. Go.',
};
