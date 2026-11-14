import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isOpen } from '../map/geometry.js';
import { createTestScene } from './testScene.js';

// Formerly map-sandbox/tools/checkScene.ts. Keeps the stand-in round honest until Step 3 replaces it.
const scene = createTestScene();
const ICON_DIAMETER = 22;

test('test round keeps every agent on walkable floor', () => {
  const offFloor: string[] = [];
  for (let t = 0; t <= scene.duration; t += 0.02) {
    for (const agent of scene.stateAt(t).agents) {
      if (!isOpen(agent.x, agent.y)) offFloor.push(`t=${t.toFixed(2)} ${agent.tag} [${agent.x.toFixed(0)}, ${agent.y.toFixed(0)}]`);
    }
  }
  assert.deepEqual(offFloor.slice(0, 10), []);
});

test('live agents never overlap in the test round', () => {
  const overlaps: string[] = [];
  for (let t = 0; t <= scene.duration; t += 0.05) {
    const live = scene.stateAt(t).agents.filter(agent => agent.alive);
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!; const b = live[j]!;
      if (Math.hypot(a.x - b.x, a.y - b.y) < ICON_DIAMETER) overlaps.push(`t=${t.toFixed(2)} ${a.tag}/${b.tag}`);
    }
  }
  assert.deepEqual(overlaps.slice(0, 10), []);
});

test('test round is ordered, uses at most three smokes and plants inside the round', () => {
  const times = scene.events.map(event => event.t);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.ok(times.every(t => t >= 0 && t <= scene.duration));
  assert.equal(scene.brimSmokesLeft(0), 3);
  assert.ok(scene.brimSmokesLeft(scene.duration) >= 0);
  assert.ok(scene.plantStart + scene.plantDuration < scene.duration);
  assert.equal(scene.stateAt(scene.duration).spike.state, 'planted');
});
