import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RegionIdSchema } from '../../../shared/schema.js';
import { ATTACKER_STARTS, CALLOUT_ALIASES, DEFENDER_SPOTS, PLANT_SPOTS, REGIONS, SMOKE_TARGETS } from './bindA.js';
import { findPath, hasLOS, inPlantZone, isOpen, navLine, regionAt } from './geometry.js';
import type { Vec } from './types.js';

test('map regions are exactly the shared RegionId list', () => {
  const ids = REGIONS.map(region => region.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate region id');
  assert.deepEqual([...ids].sort(), [...RegionIdSchema.options].sort());
});

test('every region label sits inside its own region', () => {
  for (const region of REGIONS) assert.equal(regionAt(...region.label), region.id, region.id);
});

test('callout aliases are lowercase and never shared between regions', () => {
  const owner = new Map<string, string>();
  for (const [region, aliases] of Object.entries(CALLOUT_ALIASES)) {
    assert.ok(aliases.length > 0, `${region} has no aliases`);
    for (const alias of aliases) {
      assert.equal(alias, alias.toLowerCase(), alias);
      assert.equal(owner.get(alias), undefined, `"${alias}" maps to both ${owner.get(alias)} and ${region}`);
      owner.set(alias, region);
    }
  }
});

test('smoke targets, plant spots, defender spots and attacker starts are on walkable floor', () => {
  for (const [name, smoke] of Object.entries(SMOKE_TARGETS)) assert.ok(isOpen(...smoke.at), `smoke ${name}`);
  for (const [name, spot] of Object.entries(PLANT_SPOTS)) assert.ok(inPlantZone(...spot), `plant ${name}`);
  for (const [name, spot] of Object.entries(DEFENDER_SPOTS)) assert.ok(isOpen(...spot.pos), `defender ${name}`);
  for (const start of Object.values(ATTACKER_STARTS).flat()) assert.ok(isOpen(...start), `start ${start}`);
});

test('A* reaches both plant spots from every attacker start along walkable segments', () => {
  for (const start of Object.values(ATTACKER_STARTS).flat()) {
    for (const [name, spot] of Object.entries(PLANT_SPOTS)) {
      const path = findPath(start, spot);
      assert.deepEqual(path.at(-1), spot, `${start} → ${name}`);
      // The first leg starts off-grid (spawn points sit near walls); every later leg must be on the nav grid.
      for (let i = 1; i < path.length; i++) assert.ok(navLine(path[i - 1]!, path[i]!), `${start} → ${name}, leg ${i}`);
    }
  }
});

test('a smoke between two agents blocks line of sight', () => {
  const { pos, watch } = DEFENDER_SPOTS.uhall;
  assert.ok(hasLOS(pos, watch));
  const mid: Vec = [(pos[0] + watch[0]) / 2, (pos[1] + watch[1]) / 2];
  assert.equal(hasLOS(pos, watch, [{ x: mid[0], y: mid[1], r: 20 }]), false);
});
