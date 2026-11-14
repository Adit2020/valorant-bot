// createMapView(): the only thing the rest of the app needs from the map.
//
//   const map = createMapView(canvas);
//   map.render(state, simTime);                          // every frame
//   map.spawnEffect({ type: 'smoke', from, to }, simTime); // when something happens
//
// The canvas fills its parent's width and keeps the 10:7 world aspect ratio.

import {
  DEFENDER_SPOTS,
  HEAVEN_LEDGE,
  OBSTACLES,
  PLANT_SPOTS,
  PLANT_ZONE,
  REGIONS,
  SITE_RECTS,
  SMOKE_TARGETS,
  WORLD,
} from './bindA.js';
import {
  activeSmokes,
  drawAirEffects,
  drawFloorEffects,
  drawKillFeed,
  drawTopEffects,
  effectEnd,
  seedFor,
  type ActiveEffect,
} from './effects.js';
import { NAV, cellCenter, navOpen, type Circle } from './geometry.js';
import { circle, drawAgent } from './icons.js';
import { SIZES, THEME, font } from './theme.js';
import type { AgentView, MapEffect, MapOptions, MapState, SpikeView, Vec } from './types.js';

export interface MapView {
  render(state: MapState, simTime: number): void;
  spawnEffect(effect: MapEffect, simTime: number): void;
  clearEffects(): void;
  /** Visual smoke footprints for sandbox previews. Gameplay uses Round.activeSmokes(). */
  activeSmokes(simTime: number): Circle[];
  setOptions(patch: Partial<MapOptions>): void;
  getOptions(): MapOptions;
  /** Mouse position (clientX/clientY) → world units. */
  clientToWorld(clientX: number, clientY: number): Vec;
  destroy(): void;
}

const DEFAULT_OPTIONS: MapOptions = { showLabels: true, designerView: false, showNav: false };

export function createMapView(canvas: HTMLCanvasElement, initial: Partial<MapOptions> = {}): MapView {
  const maybeCtx = canvas.getContext('2d');
  if (!maybeCtx) throw new Error('Canvas 2D not supported');
  const ctx: CanvasRenderingContext2D = maybeCtx;

  let opts: MapOptions = { ...DEFAULT_OPTIONS, ...initial };
  let effects: ActiveEffect[] = [];
  let cssW = 0;
  let dpr = 1;
  let staticLayer: HTMLCanvasElement | null = null;
  let needsResize = true;

  const host = canvas.parentElement ?? canvas;
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => (needsResize = true)) : null;
  ro?.observe(host);

  function resize() {
    const w = host === canvas ? canvas.clientWidth : host.clientWidth;
    cssW = Math.max(320, w || WORLD.w);
    const cssH = (cssW * WORLD.h) / WORLD.w;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    staticLayer = null;
    needsResize = false;
  }

  function worldScale() {
    return (cssW / WORLD.w) * dpr;
  }

  // ---------- static layer (floor, walls, cover, labels), cached until resize/options change ----------
  function buildStatic(): HTMLCanvasElement {
    const layer = document.createElement('canvas');
    layer.width = canvas.width;
    layer.height = canvas.height;
    const g = layer.getContext('2d')!;
    const k = worldScale();
    g.setTransform(k, 0, 0, k, 0, 0);

    g.fillStyle = THEME.panel;
    g.fillRect(0, 0, WORLD.w, WORLD.h);

    // walls: stroke every rect thick first, then fill floors on top → only the outer edge survives
    g.strokeStyle = THEME.wall;
    g.lineWidth = 7;
    g.lineJoin = 'round';
    for (const reg of REGIONS) for (const r of reg.rects) g.strokeRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
    g.fillStyle = THEME.floor;
    for (const reg of REGIONS) for (const r of reg.rects) g.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);

    // site tint
    g.fillStyle = THEME.floorSite;
    for (const r of SITE_RECTS) g.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);

    // the actual bombsite: red outline + faint fill + "A" in the corner
    {
      const [x1, y1, x2, y2] = PLANT_ZONE;
      g.fillStyle = THEME.plantZoneFill;
      g.fillRect(x1, y1, x2 - x1, y2 - y1);
      g.strokeStyle = THEME.plantZoneLine;
      g.lineWidth = 2;
      g.strokeRect(x1, y1, x2 - x1, y2 - y1);
      g.fillStyle = THEME.plantZoneLine;
      g.font = font(22, 800);
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillText('A', x1 + 7, y1 + 5);
    }

    // Heaven is high ground: hatch it and draw the ledge where its stairs drop into back site
    const heaven = REGIONS.find((r) => r.id === 'heaven')!;
    const hx1 = Math.min(...heaven.rects.map((r) => r[0]));
    const hy1 = Math.min(...heaven.rects.map((r) => r[1]));
    const hx2 = Math.max(...heaven.rects.map((r) => r[2]));
    const hy2 = Math.max(...heaven.rects.map((r) => r[3]));
    g.save();
    g.beginPath();
    for (const r of heaven.rects) g.rect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.035)';
    g.lineWidth = 1;
    for (let x = hx1 - (hy2 - hy1); x < hx2; x += 9) {
      g.beginPath();
      g.moveTo(x, hy1);
      g.lineTo(x + (hy2 - hy1), hy2);
      g.stroke();
    }
    g.restore();
    g.setLineDash([6, 5]);
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(HEAVEN_LEDGE[0][0] + 2, HEAVEN_LEDGE[0][1]);
    g.lineTo(HEAVEN_LEDGE[1][0] - 2, HEAVEN_LEDGE[1][1]);
    g.stroke();
    g.setLineDash([]);

    // cover: stroke every piece, then fill on top, so multi-rect shapes (Triple's L) read as one block
    g.strokeStyle = THEME.coverEdge;
    g.lineWidth = 3;
    for (const o of OBSTACLES) for (const [x1, y1, x2, y2] of o.rects) g.strokeRect(x1, y1, x2 - x1, y2 - y1);
    g.fillStyle = THEME.cover;
    for (const o of OBSTACLES) for (const [x1, y1, x2, y2] of o.rects) g.fillRect(x1, y1, x2 - x1, y2 - y1);
    if (opts.showLabels) {
      g.font = font(9.5, 700);
      g.fillStyle = THEME.labelStrong;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const o of OBSTACLES) if (o.label) g.fillText(o.name.toUpperCase(), o.label[0], o.label[1]);
    }

    // plant spot: faint dashed diamond so players know where "default" is
    drawDiamondOutline(g, PLANT_SPOTS.default, 9, 'rgba(255,77,77,0.28)');

    if (opts.showNav) {
      g.fillStyle = 'rgba(46,196,182,0.22)';
      for (let j = 0; j < NAV.rows; j++)
        for (let i = 0; i < NAV.cols; i++)
          if (navOpen(i, j)) {
            const [x, y] = cellCenter(i, j);
            g.fillRect(x - 1, y - 1, 2, 2);
          }
    }

    if (opts.showLabels) {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const reg of REGIONS) {
        const onCover = reg.id === 'truck' || reg.id === 'triple';
        g.font = font(onCover ? 9.5 : SIZES.labelSize, 700);
        g.fillStyle = onCover ? THEME.labelStrong : THEME.label;
        g.fillText(reg.name.toUpperCase(), reg.label[0], reg.label[1]);
      }
    }

    if (opts.designerView) drawDesignerOverlay(g);
    return layer;
  }

  function drawDesignerOverlay(g: CanvasRenderingContext2D) {
    g.save();
    g.setLineDash([4, 4]);
    g.lineWidth = 1;
    for (const reg of REGIONS) {
      g.strokeStyle = 'rgba(255,209,102,0.45)';
      for (const r of reg.rects) g.strokeRect(r[0] + 1.5, r[1] + 1.5, r[2] - r[0] - 3, r[3] - r[1] - 3);
      g.fillStyle = 'rgba(255,209,102,0.75)';
      g.font = font(8.5, 600);
      g.textAlign = 'left';
      g.textBaseline = 'top';
      const first = reg.rects[0];
      if (first) g.fillText(reg.id, first[0] + 4, first[1] + 4);
    }
    g.setLineDash([]);
    // smoke targets
    for (const s of Object.values(SMOKE_TARGETS)) {
      const [x, y] = s.at;
      g.strokeStyle = THEME.brim;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x - 6, y);
      g.lineTo(x + 6, y);
      g.moveTo(x, y - 6);
      g.lineTo(x, y + 6);
      g.stroke();
      g.fillStyle = THEME.brim;
      g.font = font(8.5, 600);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(`smoke: ${s.label}`, x + 8, y);
    }
    // defender spots + the angle they hold
    for (const [name, d] of Object.entries(DEFENDER_SPOTS)) {
      g.setLineDash([3, 4]);
      g.strokeStyle = 'rgba(239,71,111,0.35)';
      g.beginPath();
      g.moveTo(d.pos[0], d.pos[1]);
      g.lineTo(d.watch[0], d.watch[1]);
      g.stroke();
      g.setLineDash([]);
      drawDiamondOutline(g, d.pos, 7, 'rgba(239,71,111,0.9)');
      g.fillStyle = 'rgba(239,71,111,0.9)';
      g.font = font(8.5, 600);
      g.textAlign = 'left';
      g.fillText(`def: ${name}`, d.pos[0] + 9, d.pos[1] + 10);
    }
    // plant spots
    for (const [name, p] of Object.entries(PLANT_SPOTS)) {
      g.strokeStyle = 'rgba(46,196,182,0.9)';
      g.lineWidth = 1.5;
      circle(g, p[0], p[1], 8);
      g.stroke();
      g.fillStyle = 'rgba(46,196,182,0.9)';
      g.fillText(`plant: ${name}`, p[0] + 11, p[1]);
    }
    g.restore();
  }

  function drawDiamondOutline(g: CanvasRenderingContext2D, p: Vec, s: number, color: string) {
    g.save();
    g.translate(p[0], p[1]);
    g.rotate(Math.PI / 4);
    g.setLineDash([3, 2]);
    g.strokeStyle = color;
    g.lineWidth = 1.5;
    g.strokeRect(-s / 2, -s / 2, s, s);
    g.restore();
  }

  // ---------- spike ----------
  function drawSpike(spike: SpikeView, t: number) {
    if (spike.state === 'carried') return;
    const { x, y } = spike;
    const diamond = (color: string, size: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = color;
      ctx.strokeStyle = THEME.ink;
      ctx.lineWidth = 1.5;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.strokeRect(-size / 2, -size / 2, size, size);
      ctx.restore();
    };
    const ring = (progress: number, color: string, label: string) => {
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      circle(ctx, x, y, 21);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, y, 21, -Math.PI / 2, -Math.PI / 2 + Math.max(0.001, progress) * Math.PI * 2);
      ctx.stroke();
      ctx.font = font(8.5, 800);
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, x, y + 27);
    };

    if (spike.state === 'dropped') {
      diamond('rgba(255,77,77,0.6)', 8);
      return;
    }
    if (spike.state === 'planting') {
      diamond(THEME.spike, 7);
      ring(spike.progress, THEME.plantRing, 'PLANTING');
      return;
    }
    if (spike.state === 'planted' || spike.state === 'defusing') {
      const p = (((t - spike.plantedAt) % 1) + 1) % 1;
      ctx.save();
      ctx.strokeStyle = `rgba(255,77,77,${(1 - p) * 0.85})`;
      ctx.lineWidth = 2;
      circle(ctx, x, y, 10 + 34 * p);
      ctx.stroke();
      ctx.shadowColor = THEME.spike;
      ctx.shadowBlur = 12;
      diamond(THEME.spike, 10);
      ctx.restore();
      if (spike.state === 'defusing') ring(spike.progress, THEME.defuseRing, 'DEFUSING');
      return;
    }
    if (spike.state === 'defused') {
      diamond('#5B6270', 10);
      return;
    }
    // detonated
    ctx.fillStyle = 'rgba(255,77,77,0.18)';
    circle(ctx, x, y, 90);
    ctx.fill();
    diamond(THEME.spike, 10);
  }

  function sortAgents(agents: AgentView[]): AgentView[] {
    // dead underneath, Brim on top so he's never hidden by a teammate
    return [...agents].sort((a, b) => Number(a.alive) - Number(b.alive) || Number(!!a.isBrim) - Number(!!b.isBrim));
  }

  return {
    render(state, t) {
      if (needsResize || canvas.width === 0) resize();
      if (!staticLayer) staticLayer = buildStatic();
      // forget finished effects, and any "from the future" after seeking backwards
      effects = effects.filter((e) => e.t0 <= t + 1e-6 && t - e.t0 <= effectEnd(e));

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(staticLayer, 0, 0);
      const k = worldScale();
      ctx.setTransform(k, 0, 0, k, 0, 0);

      drawFloorEffects(ctx, effects, t);
      drawSpike(state.spike, t);
      for (const a of sortAgents(state.agents)) drawAgent(ctx, a, t);
      drawAirEffects(ctx, effects, t, opts.designerView);
      drawTopEffects(ctx, effects, t);
      drawKillFeed(ctx, effects, t, WORLD.w - 12, 22);
    },
    spawnEffect(effect, t) {
      effects.push({ ...effect, t0: t, seed: seedFor(effect) } as ActiveEffect);
    },
    clearEffects() {
      effects = [];
    },
    activeSmokes(t) {
      return activeSmokes(effects, t);
    },
    setOptions(patch) {
      opts = { ...opts, ...patch };
      staticLayer = null;
    },
    getOptions() {
      return { ...opts };
    },
    clientToWorld(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      return [((clientX - r.left) / r.width) * WORLD.w, ((clientY - r.top) / r.height) * WORLD.h];
    },
    destroy() {
      ro?.disconnect();
    },
  };
}
