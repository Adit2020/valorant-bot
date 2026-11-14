// Top-down Bind A site, rebuilt to match the team's reference layout (simplified to rectangles; our own art).
// World units: 1000 x 700. Attackers come up A Short (bottom-left) and Showers (bottom-right);
// defenders come from A CT along the top, into site through Vent (left) or down from Heaven (right).
// Tweak any rectangle with the sandbox's coordinate tool (click = point, shift+drag = rectangle).

import type { RegionId, Vec } from './types.js';

export type Rect = [number, number, number, number]; // x1, y1, x2, y2

export const WORLD = { w: 1000, h: 700 } as const;

export interface Region {
  id: RegionId;
  name: string;
  rects: Rect[];
  /** Where the callout name is printed. */
  label: Vec;
  callable?: boolean;
}

// Order matters: regionAt() returns the first region containing a point, so small regions come first.
export const REGIONS: Region[] = [
  { id: 'triple', name: 'Triple', rects: [[585, 296, 645, 358]], label: [615, 314] },
  { id: 'cubby', name: 'Cubby', rects: [[300, 518, 350, 618]], label: [320, 586] },
  { id: 'vent', name: 'Vent', rects: [[330, 128, 390, 248], [390, 198, 450, 258]], label: [360, 173] },
  { id: 'heaven', name: 'Heaven', rects: [[550, 58, 720, 148], [620, 148, 690, 198]], label: [665, 90] },
  { id: 'a_ct', name: 'A CT', rects: [[250, 8, 310, 68], [270, 58, 550, 128]], label: [378, 90] },
  { id: 'uhall', name: 'U-Hall', rects: [[280, 308, 450, 348], [290, 278, 370, 308], [400, 278, 450, 308], [300, 348, 330, 360]], label: [318, 293] },
  { id: 'pillar', name: 'Pillar', rects: [[280, 360, 420, 428], [420, 360, 450, 428]], label: [338, 398] },
  { id: 'back_site', name: 'Back Site', rects: [[450, 158, 560, 198], [450, 198, 700, 240], [700, 198, 740, 298]], label: [505, 178] },
  { id: 'truck', name: 'Truck', rects: [[450, 240, 488, 428], [488, 313, 552, 360]], label: [496, 337] },
  { id: 'tower', name: 'Tower', rects: [[700, 368, 740, 428], [620, 428, 740, 468]], label: [655, 448] },
  { id: 'default', name: 'Default', rects: [[488, 240, 700, 428]], label: [602, 418] },
  { id: 'a_short', name: 'A Short', rects: [[350, 428, 550, 508], [350, 508, 420, 686]], label: [471, 490] },
  { id: 'showers', name: 'Showers', rects: [[610, 468, 860, 528]], label: [778, 498] },
  { id: 'a_lobby', name: 'A Lobby', rects: [[750, 528, 860, 558], [750, 558, 820, 648], [740, 648, 850, 686]], label: [785, 596] },
  { id: 'a_link', name: 'A Link', rects: [[240, 648, 350, 686]], label: [295, 668] },
];

export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, Region>;

/** Site floor, tinted slightly lighter on the map. */
export const SITE_RECTS: Rect[] = [[450, 158, 560, 198], [450, 198, 740, 240], [700, 198, 740, 298], [450, 240, 700, 428], [700, 368, 740, 428], [620, 428, 740, 468], [350, 428, 550, 508], [420, 360, 450, 428]];
export const SITE_REGIONS: RegionId[] = ['back_site', 'truck', 'default', 'triple', 'tower'];

/** The actual bombsite: the spike can only be planted inside this rectangle (drawn as the red outline). */
export const PLANT_ZONE: Rect = [488, 240, 665, 408];

/** Where Heaven's stairs drop into back site (drawn as a dashed ledge). */
export const HEAVEN_LEDGE: [Vec, Vec] = [[620, 198], [690, 198]];

/**
 * Solid cover: blocks movement and line of sight. Several rects = one shape (Triple is an L).
 * `label` prints the name next to the cover (Truck and Triple get theirs from their region label).
 */
export const OBSTACLES: { id: string; name: string; rects: Rect[]; label?: Vec }[] = [
  { id: 'truck_obj', name: 'Truck', rects: [[449, 320, 542, 353]] },
  { id: 'triple_obj', name: 'Triple', rects: [[592, 303, 638, 326], [615, 326, 638, 348]] },
  { id: 'pillar_obj', name: 'Pillar', rects: [[395, 363, 422, 406]] },
  { id: 'site_box', name: 'Box', rects: [[529, 432, 555, 454]] },
  { id: 'tower_box', name: 'Tower box', rects: [[690, 439, 740, 467]] },
  { id: 'tower_pole', name: 'Tower', rects: [[722, 366, 741, 409]] },
  { id: 'short_box', name: 'Box', rects: [[395, 523, 424, 549]] },
];

/** Brim's usual smoke spots. Keys double as validator targets. */
export const SMOKE_TARGETS = {
  heaven: { label: 'Heaven', at: [655, 173] as Vec },
  uhall: { label: 'U-Hall', at: [402, 323] as Vec },
  vent: { label: 'Vent', at: [428, 228] as Vec },
  tower: { label: 'Tower', at: [712, 398] as Vec },
  truck_triple_gap: { label: 'Truck–Triple gap', at: [568, 336] as Vec },
} as const;

export const PLANT_SPOTS = {
  default: [565, 373] as Vec,
  alt: [655, 264] as Vec, // back site, right
} as const;

/** Where defenders usually stand, and the angle they hold. */
export const DEFENDER_SPOTS = {
  heaven: { pos: [655, 158] as Vec, watch: [565, 420] as Vec },
  uhall: { pos: [340, 328] as Vec, watch: [315, 383] as Vec },
  vent: { pos: [360, 196] as Vec, watch: [450, 228] as Vec },
  back_site: { pos: [565, 220] as Vec, watch: [478, 458] as Vec },
  tower: { pos: [712, 383] as Vec, watch: [665, 483] as Vec },
  triple: { pos: [602, 368] as Vec, watch: [478, 470] as Vec },
  truck: { pos: [502, 306] as Vec, watch: [640, 483] as Vec },
  cubby: { pos: [320, 573] as Vec, watch: [385, 533] as Vec },
} as const;

export const ATTACKER_STARTS = {
  short: [[372, 656], [402, 670], [372, 680]] as Vec[],
  showers: [[778, 668], [810, 676]] as Vec[],
};

/**
 * Words players actually say for each callout. Feed these to the keyword matcher (Step 6).
 * Longest phrases first when matching, so "back truck" wins over "truck".
 */
export const CALLOUT_ALIASES: Record<RegionId, string[]> = {
  heaven: ['heaven', 'stairs', 'top'],
  tower: ['tower box', 'tower'],
  vent: ['vents', 'vent', 'ct door', 'door'],
  a_ct: ['a ct', 'ct', 'c t', 'see tea', 'spawn'],
  back_site: ['back site', 'backsite', 'back'],
  uhall: ['u hall', 'u-hall', 'uhall', 'u haul', 'you hall', 'lamps', 'lamp'],
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
