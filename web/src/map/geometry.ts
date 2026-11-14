// Walkability, regions, line of sight and A* for Bind A.
// Used by the renderer now, and by the sim / Brim's fast layer later (Steps 3-4).

import { OBSTACLES, PLANT_ZONE, REGIONS, WORLD, type Rect } from './bindA.js';
import type { RegionId, Vec } from './types.js';

export interface Circle {
  x: number;
  y: number;
  r: number;
}

const FINE = 5; // line-of-sight grid
const COARSE = 10; // nav grid
export const NAV = { cell: COARSE, cols: WORLD.w / COARSE, rows: WORLD.h / COARSE };

const inRect = (x: number, y: number, r: Rect) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];

function rawOpen(x: number, y: number): boolean {
  let inside = false;
  for (const reg of REGIONS) {
    if (reg.rects.some((r) => inRect(x, y, r))) {
      inside = true;
      break;
    }
  }
  if (!inside) return false;
  return !OBSTACLES.some((o) => o.rects.some((r) => inRect(x, y, r)));
}

// ---------- fine grid (line of sight) ----------
const fineCols = WORLD.w / FINE;
const fineRows = WORLD.h / FINE;
const openFine = new Uint8Array(fineCols * fineRows);
for (let j = 0; j < fineRows; j++)
  for (let i = 0; i < fineCols; i++) openFine[j * fineCols + i] = rawOpen(i * FINE + FINE / 2, j * FINE + FINE / 2) ? 1 : 0;

export function isOpen(x: number, y: number): boolean {
  const i = Math.floor(x / FINE);
  const j = Math.floor(y / FINE);
  if (i < 0 || j < 0 || i >= fineCols || j >= fineRows) return false;
  return openFine[j * fineCols + i] === 1;
}

// ---------- nav grid (eroded one cell so agents don't clip corners) ----------
const rawNav = new Uint8Array(NAV.cols * NAV.rows);
for (let j = 0; j < NAV.rows; j++)
  for (let i = 0; i < NAV.cols; i++) rawNav[j * NAV.cols + i] = rawOpen(i * COARSE + COARSE / 2, j * COARSE + COARSE / 2) ? 1 : 0;

const navGrid = new Uint8Array(NAV.cols * NAV.rows);
for (let j = 0; j < NAV.rows; j++)
  for (let i = 0; i < NAV.cols; i++) {
    let ok = rawNav[j * NAV.cols + i] === 1;
    for (let dj = -1; dj <= 1 && ok; dj++)
      for (let di = -1; di <= 1 && ok; di++) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= NAV.cols || jj >= NAV.rows || rawNav[jj * NAV.cols + ii] !== 1) ok = false;
      }
    navGrid[j * NAV.cols + i] = ok ? 1 : 0;
  }

export function navOpen(i: number, j: number): boolean {
  if (i < 0 || j < 0 || i >= NAV.cols || j >= NAV.rows) return false;
  return navGrid[j * NAV.cols + i] === 1;
}

export function toCell(x: number, y: number): [number, number] {
  return [
    Math.max(0, Math.min(NAV.cols - 1, Math.floor(x / COARSE))),
    Math.max(0, Math.min(NAV.rows - 1, Math.floor(y / COARSE))),
  ];
}

export function cellCenter(i: number, j: number): Vec {
  return [i * COARSE + COARSE / 2, j * COARSE + COARSE / 2];
}

export function nearestNavCell(x: number, y: number): [number, number] {
  const [ci, cj] = toCell(x, y);
  if (navOpen(ci, cj)) return [ci, cj];
  for (let r = 1; r < 30; r++) {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        if (navOpen(ci + di, cj + dj)) {
          const d = di * di + dj * dj;
          if (d < bd) {
            bd = d;
            best = [ci + di, cj + dj];
          }
        }
      }
    if (best) return best;
  }
  return [ci, cj];
}

// ---------- regions ----------
const regionGrid = new Int16Array(NAV.cols * NAV.rows).fill(-1);
for (let j = 0; j < NAV.rows; j++)
  for (let i = 0; i < NAV.cols; i++) {
    const [x, y] = cellCenter(i, j);
    for (let k = 0; k < REGIONS.length; k++) {
      if (REGIONS[k]!.rects.some((r) => inRect(x, y, r))) {
        regionGrid[j * NAV.cols + i] = k;
        break;
      }
    }
  }

/** True if the spike may be planted here (inside the bombsite outline, on open floor). */
export function inPlantZone(x: number, y: number): boolean {
  return inRect(x, y, PLANT_ZONE) && isOpen(x, y);
}

export function regionAt(x: number, y: number): RegionId | null {
  const [i, j] = toCell(x, y);
  const k = regionGrid[j * NAV.cols + i] ?? -1;
  return REGIONS[k]?.id ?? null;
}

// ---------- line of sight ----------
export function segmentHitsCircle(a: Vec, b: Vec, c: Circle): boolean {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const fx = a[0] - c.x;
  const fy = a[1] - c.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return fx * fx + fy * fy <= c.r * c.r;
  const t = Math.max(0, Math.min(1, -(fx * dx + fy * dy) / len2));
  const px = a[0] + t * dx - c.x;
  const py = a[1] + t * dy - c.y;
  return px * px + py * py <= c.r * c.r;
}

// Visit every crossed cell, including both neighbours at an exact corner. Sampling every
// few pixels misses short crossings near corners; the same predicate now protects A* and motion.
function clearSegment(a: Vec, b: Vec, cell: number, open: (i: number, j: number) => boolean): boolean {
  let i = Math.floor(a[0] / cell), j = Math.floor(a[1] / cell);
  const endI = Math.floor(b[0] / cell), endJ = Math.floor(b[1] / cell);
  if (!open(i, j) || !open(endI, endJ)) return false;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const stepX = dx ? cell / Math.abs(dx) : Infinity;
  const stepY = dy ? cell / Math.abs(dy) : Infinity;
  let tx = dx ? ((i + Number(sx > 0)) * cell - a[0]) / dx : Infinity;
  let ty = dy ? ((j + Number(sy > 0)) * cell - a[1]) / dy : Infinity;
  while (i !== endI || j !== endJ) {
    const x = i === endI ? Infinity : tx, y = j === endJ ? Infinity : ty;
    if (Math.abs(x - y) < 1e-10 && (!open(i + sx, j) || !open(i, j + sy))) return false;
    if (x <= y) { i += sx; tx += stepX; }
    if (y <= x) { j += sy; ty += stepY; }
    if (!open(i, j)) return false;
  }
  return true;
}

const fineOpen = (i: number, j: number) => i >= 0 && j >= 0 && i < fineCols && j < fineRows && openFine[j * fineCols + i] === 1;

export function hasLOS(a: Vec, b: Vec, smokes: Circle[] = []): boolean {
  return clearSegment(a, b, FINE, fineOpen) && !smokes.some(sm => segmentHitsCircle(a, b, sm));
}

/** Distance a ray travels before hitting a wall, cover, or smoke (for fog-of-war polygons). */
export function castRay(from: Vec, angle: number, maxDist: number, smokes: Circle[] = []): number {
  const cx = Math.cos(angle);
  const cy = Math.sin(angle);
  for (let d = 5; d < maxDist; d += 5) {
    const x = from[0] + cx * d;
    const y = from[1] + cy * d;
    if (!isOpen(x, y)) return d - 5;
    for (const sm of smokes) {
      const ex = x - sm.x;
      const ey = y - sm.y;
      if (ex * ex + ey * ey <= sm.r * sm.r) return d;
    }
  }
  return maxDist;
}

/** Is a straight segment walkable on the nav grid? */
export function navLine(a: Vec, b: Vec): boolean {
  return clearSegment(a, b, COARSE, navOpen);
}

// ---------- A* ----------
/**
 * Shortest walkable path from `from` to `to`, smoothed into as few straight segments as possible.
 * `extraCost(i, j)` lets callers avoid cells (e.g. return 40 for cells inside a molly).
 */
export function findPath(from: Vec, to: Vec, extraCost?: (i: number, j: number) => number): Vec[] {
  const [si, sj] = toCell(...from);
  const [ti, tj] = toCell(...to);
  if (!navLine(from, from) || !navLine(to, to)) return [];
  const N = NAV.cols * NAV.rows;
  const g = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap: [number, number][] = []; // binary min-heap of [f, cellIndex]; indices below are always in range
  const key = (k: number) => heap[k]![0];
  const swap = (a: number, b: number) => {
    const tmp = heap[a]!;
    heap[a] = heap[b]!;
    heap[b] = tmp;
  };
  const push = (f: number, idx: number) => {
    heap.push([f, idx]);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (key(p) <= key(c)) break;
      swap(p, c);
      c = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1;
        const r = l + 1;
        let m = c;
        if (l < heap.length && key(l) < key(m)) m = l;
        if (r < heap.length && key(r) < key(m)) m = r;
        if (m === c) break;
        swap(m, c);
        c = m;
      }
    }
    return top;
  };
  const h = (i: number, j: number) => Math.hypot(i - ti, j - tj);
  const start = sj * NAV.cols + si;
  const goal = tj * NAV.cols + ti;
  g[start] = 0;
  push(h(si, sj), start);
  while (heap.length) {
    const [, cur] = pop();
    if (closed[cur]) continue;
    if (cur === goal) break;
    closed[cur] = 1;
    const ci = cur % NAV.cols;
    const cj = Math.floor(cur / NAV.cols);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di;
        const nj = cj + dj;
        if (!navOpen(ni, nj)) continue;
        if (di && dj && (!navOpen(ci + di, cj) || !navOpen(ci, cj + dj))) continue;
        const n = nj * NAV.cols + ni;
        if (closed[n]) continue;
        const step = (di && dj ? Math.SQRT2 : 1) + (extraCost ? extraCost(ni, nj) : 0);
        const ng = g[cur]! + step;
        if (ng < g[n]!) {
          g[n] = ng;
          came[n] = cur;
          push(ng + h(ni, nj), n);
        }
      }
  }
  if (came[goal] === -1 && goal !== start) return [];
  const cells: number[] = [];
  for (let c = goal; c !== -1; c = came[c]!) cells.push(c);
  cells.reverse();
  const pts = cells.map((c) => cellCenter(c % NAV.cols, Math.floor(c / NAV.cols)));
  pts.push([...to]); // Keep the final cell center available if the exact endpoint needs one more turn.
  // string pulling
  const out: Vec[] = [];
  let i = 0;
  let cursor: Vec = from;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !navLine(cursor, pts[j]!)) j--;
    const next = pts[j]!;
    if (!navLine(cursor, next)) return [];
    out.push(next);
    cursor = next;
    i = j + 1;
  }
  return out;
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
