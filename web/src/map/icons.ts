// Agent icons, drawn in code: circle + role letter + name tag + facing tick + HP ring.
// No Riot art: our own shapes and colors only.

import type { AgentView } from './types.js';
import { SIZES, THEME, font } from './theme.js';

export function drawAgent(ctx: CanvasRenderingContext2D, a: AgentView, t: number): void {
  const r = SIZES.agentRadius;
  const { x, y } = a;

  if (!a.alive) {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = THEME.dead;
    circle(ctx, x, y, r * 0.85);
    ctx.fill();
    ctx.strokeStyle = THEME.deadMark;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    const k = r * 0.45;
    ctx.beginPath();
    ctx.moveTo(x - k, y - k);
    ctx.lineTo(x + k, y + k);
    ctx.moveTo(x + k, y - k);
    ctx.lineTo(x - k, y + k);
    ctx.stroke();
    drawTag(ctx, a.tag, x, y - r - 5, THEME.deadMark);
    ctx.globalAlpha = 1;
    return;
  }

  const color = a.team === 'atk' ? THEME.atk : THEME.def;
  const dark = a.team === 'atk' ? THEME.atkDark : THEME.defDark;

  // speaking pulse (Brim talking): two amber rings expanding outward
  if (a.speaking) {
    for (let k = 0; k < 2; k++) {
      const p = ((t * 1.6 + k * 0.5) % 1 + 1) % 1;
      ctx.strokeStyle = `rgba(255,138,61,${(1 - p) * 0.55})`;
      ctx.lineWidth = 2;
      circle(ctx, x, y, r + 6 + p * 16);
      ctx.stroke();
    }
  }

  // Brim highlight ring with a soft glow so he's always findable
  if (a.isBrim) {
    ctx.save();
    ctx.shadowColor = THEME.brim;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = THEME.brim;
    ctx.lineWidth = 2.4;
    circle(ctx, x, y, r + 5.5);
    ctx.stroke();
    ctx.restore();
  }

  // facing tick
  const fx = Math.cos(a.facing);
  const fy = Math.sin(a.facing);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + fx * (r + 1), y + fy * (r + 1));
  ctx.lineTo(x + fx * (r + 9), y + fy * (r + 9));
  ctx.stroke();

  // HP ring: dark track + light arc from the top, clockwise
  ctx.lineWidth = 2;
  ctx.strokeStyle = dark;
  circle(ctx, x, y, r + 2.2);
  ctx.stroke();
  const hp = Math.max(0, Math.min(100, a.hp)) / 100;
  if (hp > 0) {
    ctx.strokeStyle = hp > 0.5 ? 'rgba(255,255,255,0.75)' : hp > 0.25 ? '#FFD166' : '#FF6B6B';
    ctx.beginPath();
    ctx.arc(x, y, r + 2.2, -Math.PI / 2, -Math.PI / 2 + hp * Math.PI * 2);
    ctx.stroke();
  }

  // body
  ctx.fillStyle = color;
  circle(ctx, x, y, r);
  ctx.fill();

  // role letter
  ctx.fillStyle = THEME.ink;
  ctx.font = font(11, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(a.role, x, y + 0.5);

  // spike carrier diamond
  if (a.hasSpike) {
    const dx = x + r * 0.85;
    const dy = y - r * 0.85;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = THEME.spike;
    ctx.strokeStyle = THEME.ink;
    ctx.lineWidth = 1.2;
    ctx.fillRect(-3.6, -3.6, 7.2, 7.2);
    ctx.strokeRect(-3.6, -3.6, 7.2, 7.2);
    ctx.restore();
  }

  // flashed: white halo
  if (a.blind && a.blind > 0) {
    ctx.save();
    ctx.shadowColor = '#FFFFFF';
    ctx.shadowBlur = 14 * a.blind;
    ctx.strokeStyle = `rgba(255,255,255,${0.85 * a.blind})`;
    ctx.lineWidth = 3;
    circle(ctx, x, y, r + 3.5);
    ctx.stroke();
    ctx.restore();
  }

  drawTag(ctx, a.tag, x, y - r - 6, a.isBrim ? THEME.brim : THEME.tag);
}

function drawTag(ctx: CanvasRenderingContext2D, tag: string, x: number, y: number, color: string): void {
  ctx.font = font(SIZES.tagSize, 700);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round'; // miter joins spike on letters like M and N
  ctx.miterLimit = 2;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(11,11,13,0.85)';
  ctx.strokeText(tag, x, y);
  ctx.fillStyle = color;
  ctx.fillText(tag, x, y);
}

export function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
}
