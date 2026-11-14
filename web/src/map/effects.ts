// Animated effects. Every animation is driven by SIM time (not the wall clock),
// so Learn mode's slow-mo and fixed-seed replays slow down and replay these too.

import type { Circle } from './geometry.js';
import { circle } from './icons.js';
import { SIZES, THEME, font } from './theme.js';
import type { MapEffect, Vec } from './types.js';

export type ActiveEffect = MapEffect & { t0: number; seed: number };

export const TIMING = {
  smokeThrow: 0.6,
  smokeBloom: 0.45,
  smokeFade: 1.5,
  smokeLife: 15,
  mollyThrow: 0.5,
  mollyLife: 7,
  flashThrow: 0.35,
  flashPop: 0.4,
  killLife: 6,
  pingLife: 2.8,
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);

/** Deterministic pseudo-random in [0, 1) so the same effect always looks the same (replays, seeking). */
function rand(seed: number, k: number): number {
  const s = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function seedFor(e: MapEffect): number {
  const p = 'to' in e ? e.to : e.at;
  const typeIdx = ['smoke', 'molly', 'flash', 'kill', 'ping'].indexOf(e.type);
  return (Math.abs(Math.floor(p[0] * 73.1 + p[1] * 19.7 + typeIdx * 101)) % 9973) + 1;
}

/** Seconds from spawn until the effect is fully gone. */
export function effectEnd(e: ActiveEffect): number {
  switch (e.type) {
    case 'smoke':
      return TIMING.smokeThrow + (e.duration ?? TIMING.smokeLife);
    case 'molly':
      return TIMING.mollyThrow + (e.duration ?? TIMING.mollyLife);
    case 'flash':
      return (e.from ? TIMING.flashThrow : 0) + TIMING.flashPop;
    case 'kill':
      return TIMING.killLife;
    case 'ping':
      return TIMING.pingLife;
  }
}

/** Smokes that currently block sight (pass these to hasLOS / castRay). */
export function activeSmokes(effects: ActiveEffect[], t: number): Circle[] {
  const out: Circle[] = [];
  for (const e of effects) {
    if (e.type !== 'smoke') continue;
    const a = t - e.t0 - TIMING.smokeThrow;
    const life = e.duration ?? TIMING.smokeLife;
    if (a < 0 || a > life - 0.3) continue;
    const r = SIZES.smokeRadius * (0.35 + 0.65 * easeOut(a / TIMING.smokeBloom));
    if (r > SIZES.smokeRadius * 0.6) out.push({ x: e.to[0], y: e.to[1], r });
  }
  return out;
}

// ---------- shared: lobbed throw arc ----------
function drawThrow(ctx: CanvasRenderingContext2D, from: Vec, to: Vec, p: number, color: string, size: number) {
  const d = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const cx = (from[0] + to[0]) / 2;
  const cy = (from[1] + to[1]) / 2 - d * 0.28; // lob "up" the screen
  const at = (q: number): Vec => {
    const u = 1 - q;
    return [u * u * from[0] + 2 * u * q * cx + q * q * to[0], u * u * from[1] + 2 * u * q * cy + q * q * to[1]];
  };
  // faint full arc preview
  ctx.save();
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.quadraticCurveTo(cx, cy, to[0], to[1]);
  ctx.stroke();
  ctx.restore();
  // trail
  for (let k = 5; k >= 1; k--) {
    const q = Math.max(0, p - k * 0.035);
    const [tx, ty] = at(q);
    ctx.globalAlpha = 0.12 * (6 - k);
    ctx.fillStyle = color;
    circle(ctx, tx, ty, size * 0.75);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const [x, y] = at(p);
  ctx.fillStyle = color;
  circle(ctx, x, y, size);
  ctx.fill();
  // landing target marker
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  circle(ctx, to[0], to[1], 6 + 3 * (1 - p));
  ctx.stroke();
}

// ---------- smoke ----------
function drawSmoke(ctx: CanvasRenderingContext2D, e: Extract<ActiveEffect, { type: 'smoke' }>, t: number, seeThrough: boolean) {
  const age = t - e.t0;
  if (age < TIMING.smokeThrow) {
    drawThrow(ctx, e.from, e.to, age / TIMING.smokeThrow, 'rgb(224,227,233)', 3.2);
    return;
  }
  const a = age - TIMING.smokeThrow;
  const life = e.duration ?? TIMING.smokeLife;
  if (a > life) return;
  const ease = easeOut(a / TIMING.smokeBloom);
  const R = SIZES.smokeRadius * (0.35 + 0.65 * ease);
  const fade = clamp01((life - a) / TIMING.smokeFade);
  const alpha = (seeThrough ? 0.42 : 0.97) * fade * (0.45 + 0.55 * ease);
  const [c0, c1, c2] = THEME.smoke;
  const [x, y] = e.to;

  // dense core so whatever is inside is hidden
  const g = ctx.createRadialGradient(x, y, 0, x, y, R * 1.08);
  g.addColorStop(0, `rgba(${c0},${c1},${c2},${alpha})`);
  g.addColorStop(0.72, `rgba(${c0 - 15},${c1 - 15},${c2 - 15},${alpha * 0.95})`);
  g.addColorStop(1, `rgba(${c0 - 25},${c1 - 25},${c2 - 25},0)`);
  ctx.fillStyle = g;
  circle(ctx, x, y, R * 1.08);
  ctx.fill();

  // drifting puffs give it a soft, living edge
  for (let k = 0; k < 7; k++) {
    const ang = (k / 7) * Math.PI * 2 + rand(e.seed, k) * 0.7 + a * (rand(e.seed, k + 20) - 0.5) * 0.18;
    const d = (0.32 + rand(e.seed, k + 40) * 0.22) * R;
    const pr = (0.42 + rand(e.seed, k + 60) * 0.18) * R;
    const px = x + Math.cos(ang) * d;
    const py = y + Math.sin(ang) * d;
    const pg = ctx.createRadialGradient(px, py, 0, px, py, pr);
    pg.addColorStop(0, `rgba(228,231,236,${alpha * 0.5})`);
    pg.addColorStop(1, `rgba(${c0},${c1},${c2},0)`);
    ctx.fillStyle = pg;
    circle(ctx, px, py, pr);
    ctx.fill();
  }

  // bloom ring as it pops
  if (a < 0.6) {
    ctx.strokeStyle = `rgba(255,255,255,${((0.6 - a) / 0.6) * 0.35})`;
    ctx.lineWidth = 2;
    circle(ctx, x, y, R * 1.05);
    ctx.stroke();
  }
}

// ---------- molly ----------
function drawMollyFire(ctx: CanvasRenderingContext2D, e: Extract<ActiveEffect, { type: 'molly' }>, t: number) {
  const f = t - e.t0 - TIMING.mollyThrow;
  const life = e.duration ?? TIMING.mollyLife;
  if (f < 0 || f > life) return;
  const [x, y] = e.to;
  const grow = easeOut(f / 0.25);
  const shrink = f > life - 0.8 ? clamp01((life - f) / 0.8) : 1;
  const R = SIZES.mollyRadius * grow * (0.6 + 0.4 * shrink);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const base = ctx.createRadialGradient(x, y, 0, x, y, R);
  base.addColorStop(0, `rgba(255,110,40,${0.32 * shrink})`);
  base.addColorStop(0.8, `rgba(255,60,20,${0.2 * shrink})`);
  base.addColorStop(1, 'rgba(255,40,10,0)');
  ctx.fillStyle = base;
  circle(ctx, x, y, R);
  ctx.fill();

  // flickering flame blobs
  for (let k = 0; k < 14; k++) {
    const ang = rand(e.seed, k) * Math.PI * 2;
    const d = Math.sqrt(rand(e.seed, k + 30)) * R * 0.78;
    const flicker = 0.55 + 0.45 * Math.sin(t * 11 + k * 1.7) * Math.sin(t * 7.3 + k);
    const br = (4.5 + rand(e.seed, k + 50) * 5) * (0.7 + 0.5 * flicker) * shrink;
    const bx = x + Math.cos(ang) * d;
    const by = y + Math.sin(ang) * d - flicker * 1.5;
    const fg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    fg.addColorStop(0, hexA(THEME.fireHot, 0.9 * (0.6 + 0.4 * flicker)));
    fg.addColorStop(0.5, hexA(THEME.fireMid, 0.6));
    fg.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = fg;
    circle(ctx, bx, by, br);
    ctx.fill();
  }

  // rising embers
  for (let k = 0; k < 7; k++) {
    const period = 0.8 + rand(e.seed, k + 70) * 0.6;
    const ph = (((t + rand(e.seed, k + 80) * 3) / period) % 1 + 1) % 1;
    const ang = rand(e.seed, k + 90) * Math.PI * 2;
    const d = rand(e.seed, k + 95) * R * 0.7;
    const ex = x + Math.cos(ang) * d + Math.sin(t * 5 + k) * 2;
    const ey = y + Math.sin(ang) * d - ph * 18;
    ctx.fillStyle = `rgba(255,210,120,${(1 - ph) * 0.8 * shrink})`;
    circle(ctx, ex, ey, 1.3);
    ctx.fill();
  }
  ctx.restore();

  // landing burst
  if (f < 0.25) {
    ctx.strokeStyle = `rgba(255,170,80,${1 - f / 0.25})`;
    ctx.lineWidth = 2.5;
    circle(ctx, x, y, 10 + 40 * (f / 0.25));
    ctx.stroke();
  }
  // edge ring
  ctx.strokeStyle = `rgba(255,120,50,${0.35 * shrink})`;
  ctx.lineWidth = 1.2;
  circle(ctx, x, y, R);
  ctx.stroke();
}

// ---------- flash ----------
function drawFlash(ctx: CanvasRenderingContext2D, e: Extract<ActiveEffect, { type: 'flash' }>, t: number, layer: 'air' | 'top') {
  const age = t - e.t0;
  const throwT = e.from ? TIMING.flashThrow : 0;
  if (age < throwT) {
    if (layer === 'air' && e.from) drawThrow(ctx, e.from, e.to, age / throwT, '#FFFFFF', 2.6);
    return;
  }
  if (layer !== 'top') return;
  const p = age - throwT;
  if (p > TIMING.flashPop) return;
  const [x, y] = e.to;
  const R = 18 + 95 * easeOut(p / 0.12);
  const alpha = 1 - p / TIMING.flashPop;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, `rgba(255,255,255,${0.95 * alpha})`);
  g.addColorStop(0.5, `rgba(255,255,255,${0.35 * alpha})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  circle(ctx, x, y, R);
  ctx.fill();
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2 + Math.PI / 8;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(ang) * R * 0.35, y + Math.sin(ang) * R * 0.35);
    ctx.lineTo(x + Math.cos(ang) * R * 0.85, y + Math.sin(ang) * R * 0.85);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- kill burst + kill feed ----------
function drawKillBurst(ctx: CanvasRenderingContext2D, e: Extract<ActiveEffect, { type: 'kill' }>, t: number) {
  const age = t - e.t0;
  if (age > 0.6) return;
  const q = age / 0.6;
  const col = e.killerTeam === 'atk' ? '239,71,111' : '46,196,182'; // victim's team color
  ctx.strokeStyle = `rgba(${col},${1 - q})`;
  ctx.lineWidth = 3;
  circle(ctx, e.at[0], e.at[1], 8 + 26 * q);
  ctx.stroke();
}

export function drawKillFeed(ctx: CanvasRenderingContext2D, effects: ActiveEffect[], t: number, right: number, top: number) {
  const kills = effects
    .filter((e): e is Extract<ActiveEffect, { type: 'kill' }> => e.type === 'kill' && t - e.t0 >= 0 && t - e.t0 <= TIMING.killLife)
    .sort((a, b) => b.t0 - a.t0)
    .slice(0, 5);
  ctx.font = font(11, 700);
  ctx.textBaseline = 'middle';
  kills.forEach((k, i) => {
    const age = t - k.t0;
    const alpha = Math.min(1, age / 0.15, (TIMING.killLife - age) / 0.8);
    const killerCol = k.killerTeam === 'atk' ? THEME.atk : THEME.def;
    const victimCol = k.killerTeam === 'atk' ? THEME.def : THEME.atk;
    const mid = '  ✕  ';
    const w1 = ctx.measureText(k.killer).width;
    const w2 = ctx.measureText(mid).width;
    const w3 = ctx.measureText(k.victim).width;
    const w = w1 + w2 + w3 + 16;
    const y = top + i * 22;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, right - w, y - 9, w, 18, 4);
    ctx.fill();
    ctx.textAlign = 'left';
    let x = right - w + 8;
    ctx.fillStyle = killerCol;
    ctx.fillText(k.killer, x, y);
    x += w1;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(mid, x, y);
    x += w2;
    ctx.fillStyle = victimCol;
    ctx.fillText(k.victim, x, y);
  });
  ctx.globalAlpha = 1;
}

// ---------- callout ping ----------
function drawPing(ctx: CanvasRenderingContext2D, e: Extract<ActiveEffect, { type: 'ping' }>, t: number) {
  const age = t - e.t0;
  if (age < 0 || age > TIMING.pingLife) return;
  const [x, y] = e.at;
  const rgb = e.team === 'def' ? '239,71,111' : e.team === 'atk' ? '46,196,182' : '255,138,61';
  for (let k = 0; k < 3; k++) {
    const q = (age - k * 0.25) / 1.1;
    if (q < 0 || q > 1) continue;
    ctx.strokeStyle = `rgba(${rgb},${(1 - q) * 0.9})`;
    ctx.lineWidth = 2;
    circle(ctx, x, y, 6 + 34 * q);
    ctx.stroke();
  }
  const alpha = Math.min(1, age / 0.15, (TIMING.pingLife - age) / 0.5);
  ctx.globalAlpha = alpha;
  ctx.font = font(10.5, 800);
  const text = e.label.toUpperCase();
  const w = ctx.measureText(text).width + 14;
  const by = y - 30;
  ctx.fillStyle = `rgba(${rgb},0.95)`;
  roundRect(ctx, x - w / 2, by - 9, w, 18, 9);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 5, by + 8);
  ctx.lineTo(x + 5, by + 8);
  ctx.lineTo(x, by + 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = THEME.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, by + 0.5);
  ctx.globalAlpha = 1;
}

// ---------- layers ----------
/** Under agents: fire on the floor. */
export function drawFloorEffects(ctx: CanvasRenderingContext2D, effects: ActiveEffect[], t: number) {
  for (const e of effects) if (e.type === 'molly') drawMollyFire(ctx, e, t);
}

/** Over agents: smokes (they hide what's inside), plus anything still flying through the air. */
export function drawAirEffects(ctx: CanvasRenderingContext2D, effects: ActiveEffect[], t: number, seeThrough: boolean) {
  for (const e of effects) {
    if (e.type === 'smoke') drawSmoke(ctx, e, t, seeThrough);
    else if (e.type === 'molly' && t - e.t0 < TIMING.mollyThrow) {
      drawThrow(ctx, e.from, e.to, (t - e.t0) / TIMING.mollyThrow, THEME.fireMid, 3);
    } else if (e.type === 'flash') drawFlash(ctx, e, t, 'air');
  }
}

/** Top: flash pops, kill bursts, callout pings. */
export function drawTopEffects(ctx: CanvasRenderingContext2D, effects: ActiveEffect[], t: number) {
  for (const e of effects) {
    if (e.type === 'flash') drawFlash(ctx, e, t, 'top');
    else if (e.type === 'kill') drawKillBurst(ctx, e, t);
    else if (e.type === 'ping') drawPing(ctx, e, t);
  }
}

// ---------- helpers ----------
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
