import { fastPlant } from './fastPlant.js';
import { fastRush } from './fastRush.js';
import { slowPush } from './slowPush.js';

export const plays = { fast_plant: fastPlant, fast_rush: fastRush, slow_push: slowPush };
export const defaultPlay = 'fast_plant';
