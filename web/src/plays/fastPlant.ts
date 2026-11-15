import { ATTACKER_STARTS, PLANT_SPOTS } from '../map/bindA.js';
import type { Role, Vec } from '../map/types.js';

interface Route {
  id: string; tag: string; role: Role; start: Vec; waypoints: Vec[];
  speed: number; delayTicks: number; watch: Vec;
}
const { short, showers } = ATTACKER_STARTS;
// Distinct lanes, departure times and final holds keep the two groups spaced apart.
export const FAST_PLANT: Route[] = [
  { id: 'brim', tag: 'BRM', role: 'C', start: short[0]!, speed: 61, delayTicks: 10,
    waypoints: [[375, 492], [485, 470], [585, 386]], watch: [565, 220] },
  { id: 'raze', tag: 'RAZ', role: 'D', start: short[1]!, speed: 81, delayTicks: 0,
    waypoints: [[380, 452], [487, 402], [560, 275]], watch: [650, 180] },
  { id: 'sova', tag: 'SOV', role: 'I', start: short[2]!, speed: 60, delayTicks: 24,
    waypoints: [[370, 495], [495, 463], PLANT_SPOTS.default], watch: [565, 220] },
  { id: 'skye', tag: 'SKY', role: 'I', start: showers[0]!, speed: 74, delayTicks: 0,
    waypoints: [[775, 495], [645, 490], [655, 410]], watch: [655, 158] },
  { id: 'cypher', tag: 'CYP', role: 'S', start: showers[1]!, speed: 62, delayTicks: 14,
    waypoints: [[805, 508], [665, 501], [670, 445]], watch: [704, 388] },
];
