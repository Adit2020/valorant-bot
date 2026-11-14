export const STEP_MS = 50;
export const DT = STEP_MS / 1000;
export type Mode = 'learn' | 'match';
export const timeScale = (mode: Mode, holding: boolean) => mode === 'learn' && holding ? 0.5 : 1;

// Accumulate elapsed wall time at the rate in effect for that interval. On a stall,
// discard time beyond five ticks; never repay that debt on subsequent frames.
export class FixedClock {
  private remainder = 0;
  get alpha() { return this.remainder / STEP_MS; }
  reset() { this.remainder = 0; }
  advance(elapsedMs: number, scale: number, step: () => void) {
    this.remainder += Math.min(250, Math.max(0, elapsedMs)) * scale;
    while (this.remainder >= STEP_MS - 1e-8) {
      this.remainder = Math.max(0, this.remainder - STEP_MS);
      step();
    }
  }
}
