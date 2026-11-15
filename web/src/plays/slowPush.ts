import type { Vec } from '../map/types.js';
import { PLANT_SPOTS } from '../map/bindA.js';
import { FAST_PLANT, type Play } from './fastPlant.js';

const controlRoutes: Record<string, Vec[]> = {
  brim: [[372, 564], [405, 485]],
  raze: [[378, 557], [382, 455]],
  sova: [[366, 583], [380, 493], [495, 463], PLANT_SPOTS.default],
  skye: [[778, 544], [765, 484]],
  cypher: [[802, 560], [805, 510]],
};
export const slowPush: Play = {
  id: 'slow_push', name: 'Slow Push', carrier: 'sova',
  routes: FAST_PLANT.map(route => ({ ...route, waypoints: controlRoutes[route.id]!,
    speed: 39, delayTicks: route.id === 'brim' ? 0 : route.id === 'sova' ? 100 : route.delayTicks + 18 })),
  goals: [{ type: 'hold', target: 'a_short' }, { type: 'move', target: 'a_short' },
    { type: 'hold', target: 'pillar' }, { type: 'plant', target: 'default' }],
  utility: 'Keep all smokes for explicit commands.',
  explanation: 'Take Short and Showers at walking speed, hold their exits and bring the spike up late.',
  confirmation: 'Slow push. Hold your angles.',
};
