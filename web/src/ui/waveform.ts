import type { ConversationState } from '../trace/log.js';
export const stateColors = { idle: [58,58,58], listening: [127,231,255], thinking: [214,156,87], speaking: [255,138,61] } as const;
export function taper(x: number) { return Math.sin(Math.PI * Math.max(0, Math.min(1, x))) ** 2; }
export function smooth(previous: number, target: number) { return previous * .8 + target * .2; }

export class Waveform {
  private frame = 0;
  private state: ConversationState = 'idle';
  private level = 0;
  private amplitude = 2;
  private color: number[] = [58,58,58];
  private observer: ResizeObserver;
  private motion = matchMedia('(prefers-reduced-motion: reduce)');
  private lastPaint = 0;
  private width = 0; private height = 0; private ratio = 0;
  constructor(private canvas: HTMLCanvasElement, private sample: () => number) {
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    this.frame = requestAnimationFrame(this.draw);
  }
  setState(state: ConversationState) { this.state = state; this.canvas.dataset.state = state; }
  private resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    this.width = width; this.height = height; this.ratio = Math.min(devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(width * this.ratio); this.canvas.height = Math.round(height * this.ratio);
  }
  private draw = (time: number) => {
    this.frame = requestAnimationFrame(this.draw);
    if (document.hidden || (this.motion.matches && time - this.lastPaint < 100)) return;
    this.lastPaint = time;
    if (this.ratio !== Math.min(devicePixelRatio || 1, 3)) this.resize();
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const t = time / 1000;
    this.level = smooth(this.level, this.sample());
    const target = this.state === 'idle' ? 1.5 + Math.sin(t * .7) * .5
      : this.state === 'thinking' ? 5 : 3 + this.level * Math.min(70, this.height * .34);
    this.amplitude = smooth(this.amplitude, target);
    this.color = this.color.map((value,i) => smooth(value, stateColors[this.state][i]!));
    ctx.setTransform(this.ratio,0,0,this.ratio,0,0);
    ctx.clearRect(0,0,this.width,this.height);
    const phase = this.motion.matches ? 0 : t;
    for (let wave = 0; wave < 3; wave++) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${this.color.map(Math.round).join(',')},${[.16,.32,.88][wave]})`;
      ctx.lineWidth = wave === 2 ? 1.6 : 1;
      ctx.shadowColor = '#FF8A3D'; ctx.shadowBlur = this.state === 'speaking' ? 10 : 0;
      for (let px = 0; px <= this.width; px += 2) {
        const x = px / Math.max(1,this.width);
        const shimmer = this.state === 'thinking' ? .3 + .7 * Math.exp(-(((x - (phase * .22 % 1.4 - .2)) * 7) ** 2)) : 1;
        const y = this.height / 2 + Math.sin(x * Math.PI * (9 + wave * 1.6) - phase * (1.6 + wave * .3) + wave) * this.amplitude * taper(x) * shimmer * (1 - wave * .12);
        if (!px) ctx.moveTo(px,y); else ctx.lineTo(px,y);
      }
      ctx.stroke();
    }
  };
  dispose() { cancelAnimationFrame(this.frame); this.observer.disconnect(); }
}
