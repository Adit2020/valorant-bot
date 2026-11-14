// Schematic, top-down Bind B site (attack side). Not a trace of Riot's minimap:
// a simplified layout that keeps the real callout names and how the lanes connect.
// World units: 1000 x 700. Attackers come from the bottom, defenders rotate in from CT (top right).

export const WORLD = { w: 1000, h: 700 };

// Each region is a callout. A region can be a union of rectangles [x1, y1, x2, y2].
export const REGIONS = [
  { id: 'spawn', name: 'Attacker Spawn', rects: [[260, 610, 700, 690]], label: [480, 655], callable: false },
  { id: 'lobby', name: 'B Lobby', rects: [[60, 590, 260, 690]], label: [160, 655] },
  { id: 'long', name: 'B Long', rects: [[60, 250, 170, 590]], label: [115, 440] },
  { id: 'garden', name: 'Garden', rects: [[60, 150, 290, 250]], label: [190, 235] },
  { id: 'elbow', name: 'Elbow', rects: [[210, 40, 770, 100], [210, 100, 290, 150], [330, 100, 420, 140]], label: [560, 70] },
  { id: 'backsite', name: 'Backsite', rects: [[290, 140, 620, 220]], label: [580, 205] },
  { id: 'box', name: 'Corner Box', rects: [[290, 220, 390, 400]], label: [340, 385] },
  { id: 'default', name: 'Default', rects: [[390, 220, 620, 330], [390, 330, 470, 400]], label: [560, 245] },
  { id: 'underhookah', name: 'Under Hookah', rects: [[470, 330, 620, 400]], label: [545, 388] },
  { id: 'cubby', name: 'Cubby', rects: [[620, 290, 665, 345]], label: [643, 357] },
  { id: 'hall', name: 'B Hall', rects: [[620, 175, 770, 245]], label: [700, 232] },
  { id: 'ct', name: 'CT', rects: [[770, 30, 960, 260]], label: [880, 245] },
  { id: 'hookah', name: 'Hookah', rects: [[560, 400, 720, 500]], label: [690, 488] },
  { id: 'short', name: 'B Short', rects: [[640, 500, 720, 610]], label: [680, 595] },
];

export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
export const SITE_REGIONS = ['backsite', 'box', 'default', 'underhookah', 'cubby'];
export const CALLABLE_REGIONS = REGIONS.filter((r) => r.callable !== false).map((r) => r.id);

// Solid cover: blocks movement and line of sight.
export const OBSTACLES = [
  [300, 255, 340, 295], // corner box
  [430, 255, 480, 290], // default box
  [505, 160, 535, 190], // backsite pillar
  [600, 430, 625, 455], // hookah crate
];

// Common defender spots per region. Bots "check" these when a call names the region.
export const AIM_SPOTS = {
  long: [[115, 300], [115, 450]],
  garden: [[115, 172], [265, 165], [180, 200]],
  elbow: [[375, 118], [300, 70], [250, 125]],
  backsite: [[580, 160], [420, 165], [330, 160]],
  box: [[370, 240], [320, 320]],
  default: [[455, 240], [560, 300], [430, 360]],
  underhookah: [[500, 355], [590, 380]],
  cubby: [[642, 318]],
  hall: [[690, 210], [640, 215]],
  ct: [[800, 150]],
  hookah: [[605, 445], [680, 470]],
  short: [[680, 540]],
  lobby: [[150, 640]],
};

export const PLANT_SPOTS = { default: [455, 312], backsite: [420, 182] };

// ---------- grids ----------
const FINE = 5; // LOS grid
const COARSE = 10; // nav grid
export const NAV = { cell: COARSE, cols: WORLD.w / COARSE, rows: WORLD.h / COARSE };

function inRect(x, y, r) {
  return x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
}

function rawOpen(x, y) {
  let inside = false;
  for (const reg of REGIONS) {
    for (const r of reg.rects) if (inRect(x, y, r)) { inside = true; break; }
    if (inside) break;
  }
  if (!inside) return false;
  for (const o of OBSTACLES) if (inRect(x, y, o)) return false;
  return true;
}

const fineCols = WORLD.w / FINE;
const fineRows = WORLD.h / FINE;
const openFine = new Uint8Array(fineCols * fineRows);
for (let j = 0; j < fineRows; j++)
  for (let i = 0; i < fineCols; i++) openFine[j * fineCols + i] = rawOpen(i * FINE + FINE / 2, j * FINE + FINE / 2) ? 1 : 0;

export function isOpen(x, y) {
  const i = (x / FINE) | 0;
  const j = (y / FINE) | 0;
  if (i < 0 || j < 0 || i >= fineCols || j >= fineRows) return false;
  return openFine[j * fineCols + i] === 1;
}

// Nav grid eroded by one cell so agents (radius ~10) don't clip corners.
const rawNav = new Uint8Array(NAV.cols * NAV.rows);
for (let j = 0; j < NAV.rows; j++)
  for (let i = 0; i < NAV.cols; i++) rawNav[j * NAV.cols + i] = rawOpen(i * COARSE + COARSE / 2, j * COARSE + COARSE / 2) ? 1 : 0;
export const navGrid = new Uint8Array(NAV.cols * NAV.rows);
for (let j = 0; j < NAV.rows; j++)
  for (let i = 0; i < NAV.cols; i++) {
    let ok = rawNav[j * NAV.cols + i] === 1;
    for (let dj = -1; dj <= 1 && ok; dj++)
      for (let di = -1; di <= 1 && ok; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= NAV.cols || jj >= NAV.rows || rawNav[jj * NAV.cols + ii] !== 1) ok = false;
      }
    navGrid[j * NAV.cols + i] = ok ? 1 : 0;
  }

export function navOpen(i, j) {
  if (i < 0 || j < 0 || i >= NAV.cols || j >= NAV.rows) return false;
  return navGrid[j * NAV.cols + i] === 1;
}

export function toCell(x, y) {
  return [Math.max(0, Math.min(NAV.cols - 1, (x / COARSE) | 0)), Math.max(0, Math.min(NAV.rows - 1, (y / COARSE) | 0))];
}
export function cellCenter(i, j) {
  return [i * COARSE + COARSE / 2, j * COARSE + COARSE / 2];
}

export function nearestNavCell(x, y) {
  const [ci, cj] = toCell(x, y);
  if (navOpen(ci, cj)) return [ci, cj];
  for (let r = 1; r < 30; r++) {
    let best = null, bd = Infinity;
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        if (navOpen(ci + di, cj + dj)) {
          const d = di * di + dj * dj;
          if (d < bd) { bd = d; best = [ci + di, cj + dj]; }
        }
      }
    if (best) return best;
  }
  return [ci, cj];
}

// Region lookup (10-unit grid, first matching region wins).
const regionGrid = new Int16Array(NAV.cols * NAV.rows).fill(-1);
for (let j = 0; j < NAV.rows; j++)
  for (let i = 0; i < NAV.cols; i++) {
    const [x, y] = cellCenter(i, j);
    for (let k = 0; k < REGIONS.length; k++) {
      if (REGIONS[k].rects.some((r) => inRect(x, y, r))) { regionGrid[j * NAV.cols + i] = k; break; }
    }
  }

export function regionAt(x, y) {
  const [i, j] = toCell(x, y);
  const k = regionGrid[j * NAV.cols + i];
  return k >= 0 ? REGIONS[k].id : null;
}

// ---------- line of sight ----------
export function segCircle(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax, dy = by - ay;
  const fx = ax - cx, fy = ay - cy;
  const a = dx * dx + dy * dy;
  if (a === 0) return fx * fx + fy * fy <= r * r;
  let t = -(fx * dx + fy * dy) / a;
  t = Math.max(0, Math.min(1, t));
  const px = ax + t * dx - cx, py = ay + t * dy - cy;
  return px * px + py * py <= r * r;
}

// smokes: array of {x, y, r}
export function hasLOS(ax, ay, bx, by, smokes = []) {
  const dx = bx - ax, dy = by - ay;
  const d = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(d / 4));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (!isOpen(ax + dx * t, ay + dy * t)) return false;
  }
  for (const sm of smokes) if (segCircle(ax, ay, bx, by, sm.x, sm.y, sm.r)) return false;
  return true;
}

// Ray march for fog-of-war polygons (render only).
export function castRay(ax, ay, ang, maxD, smokes = []) {
  const cx = Math.cos(ang), cy = Math.sin(ang);
  let d = 0;
  while (d < maxD) {
    d += 5;
    const x = ax + cx * d, y = ay + cy * d;
    if (!isOpen(x, y)) return d - 5;
    for (const sm of smokes) {
      const ex = x - sm.x, ey = y - sm.y;
      if (ex * ex + ey * ey <= sm.r * sm.r) return d;
    }
  }
  return maxD;
}

// Is a straight segment walkable on the nav grid? (path smoothing)
export function navLine(ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(d / 5));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const [i, j] = toCell(ax + (bx - ax) * t, ay + (by - ay) * t);
    if (!navOpen(i, j)) return false;
  }
  return true;
}

// ---------- A* ----------
export function findPath(sx, sy, tx, ty, extraCost = null) {
  const [si, sj] = nearestNavCell(sx, sy);
  const [ti, tj] = nearestNavCell(tx, ty);
  const N = NAV.cols * NAV.rows;
  const g = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = [];
  const push = (f, idx) => {
    heap.push([f, idx]);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heap[p][0] <= heap[c][0]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1, r = l + 1;
        let m = c;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c], heap[m]];
        c = m;
      }
    }
    return top;
  };
  const h = (i, j) => Math.hypot(i - ti, j - tj);
  const start = sj * NAV.cols + si, goal = tj * NAV.cols + ti;
  g[start] = 0;
  push(h(si, sj), start);
  while (heap.length) {
    const [, cur] = pop();
    if (closed[cur]) continue;
    if (cur === goal) break;
    closed[cur] = 1;
    const ci = cur % NAV.cols, cj = (cur / NAV.cols) | 0;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (!navOpen(ni, nj)) continue;
        if (di && dj && (!navOpen(ci + di, cj) || !navOpen(ci, cj + dj))) continue;
        const ni2 = nj * NAV.cols + ni;
        if (closed[ni2]) continue;
        let step = di && dj ? 1.4142 : 1;
        if (extraCost) step += extraCost(ni, nj);
        const ng = g[cur] + step;
        if (ng < g[ni2]) {
          g[ni2] = ng;
          came[ni2] = cur;
          push(ng + h(ni, nj), ni2);
        }
      }
  }
  if (came[goal] === -1 && goal !== start) return [[tx, ty]];
  const cells = [];
  for (let c = goal; c !== -1; c = came[c]) cells.push(c);
  cells.reverse();
  const pts = cells.map((c) => cellCenter(c % NAV.cols, (c / NAV.cols) | 0));
  // final point: exact target if walkable
  const [fi, fj] = toCell(tx, ty);
  if (navOpen(fi, fj)) pts[pts.length - 1] = [tx, ty];
  // string pulling
  const out = [];
  let i = 0;
  let from = [sx, sy];
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !navLine(from[0], from[1], pts[j][0], pts[j][1])) j--;
    out.push(pts[j]);
    from = pts[j];
    i = j + 1;
  }
  return out;
}

export function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
