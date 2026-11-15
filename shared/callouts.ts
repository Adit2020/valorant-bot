import type { RegionId } from './schema.js';

export const CALLOUT_ALIASES: Record<RegionId, string[]> = {
  heaven: ['heaven', 'stairs', 'top'],
  tower: ['tower box', 'tower'],
  vent: ['vents', 'vent', 'ct door', 'door'],
  a_ct: ['a ct', 'ct', 'c t', 'see tea', 'spawn'],
  back_site: ['back site', 'backsite', 'back'],
  uhall: ['u hall', 'u-hall', 'uhall', 'u haul', 'you hall', 'you haul', 'uhaul', 'lamps', 'lamp'],
  pillar: ['pillar'],
  truck: ['back truck', 'truck', 'tank'],
  triple: ['triple box', 'triples', 'triple', 'tetris', 'l box'],
  default: ['default', 'plant spot'],
  showers: ['showers', 'shower', 'bath', 'baths', 'bathroom', 'a bath'],
  a_short: ['a short', 'short', 'teleporter', 'tp'],
  cubby: ['cubby', 'cubbie', 'cuddy'],
  a_lobby: ['a lobby', 'lobby'],
  a_link: ['a link', 'link', 'market'],
};
