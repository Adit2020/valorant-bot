import { createMapView } from '../map/index.js';
import { Round, ROUND_TICKS, type RoundEvent } from '../sim/round.js';
import { DT, FixedClock, timeScale, type Mode } from '../sim/loop.js';
import { isTypingTarget } from '../voice/controls.js';

export type { Mode } from '../sim/loop.js';

export interface MapPanelHooks {
  /** True while push-to-talk is held. Learn mode runs the round at 0.5× during that time. */
  isTalking(): boolean;
  /** True while Brim's voice is playing. Drives the amber pulse on his icon. */
  isBrimSpeaking(): boolean;
  /** Called for the L shortcut, so the voice stage's Learn/Match buttons stay the single control. */
  toggleMode(): void;
}

export interface MapPanel {
  setMode(mode: Mode): void;
  syncVoice(): void;
  dispose(): void;
}

const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function mountMapPanel(root: HTMLElement, hooks: MapPanelHooks): MapPanel {
  const $ = <T extends HTMLElement>(selector: string) => {
    const found = root.querySelector<T>(selector);
    if (!found) throw new Error(`Map panel is missing ${selector}`);
    return found;
  };
  const canvas = $<HTMLCanvasElement>('#map');
  const playButton = $<HTMLButtonElement>('#map-play');
  const labels = $<HTMLInputElement>('#map-labels');
  const designer = $<HTMLInputElement>('#map-designer');
  const hud = {
    timerKey: $('#hud-timer-k'), timer: $('#hud-timer'), smokes: $('#hud-smokes'),
    spike: $('#hud-spike'), mode: $('#hud-mode'),
  };

  const param = new URLSearchParams(location.search).get('seed');
  const round = new Round(param && /^\d{1,10}$/.test(param) ? Number(param) : 2026);
  $('.hud-tag').textContent = 'Fast plant · Seed ' + round.seed;
  const fixed = new FixedClock();
  const map = createMapView(canvas, { showLabels: labels.checked, designerView: designer.checked });
  const effects: RoundEvent[] = []; // bounded by one 40-second round; replay on view changes only
  const listeners = new AbortController();
  const on = { signal: listeners.signal };

  let playing = true;
  let mode: Mode = 'learn';
  let scale = timeScale(mode, hooks.isTalking());
  let lastFrame = performance.now();
  let frame = 0;
  let visible = true;

  const text = new Map<HTMLElement, string>();
  const set = (el: HTMLElement, value: string) => {
    if (text.get(el) === value) return;
    text.set(el, value);
    el.textContent = value;
  };

  function setPlaying(next: boolean) {
    lastFrame = performance.now();
    playing = next;
    playButton.textContent = playing ? 'Pause' : 'Play';
    playButton.setAttribute('aria-pressed', String(!playing));
  }
  function restart() {
    effects.length = 0;
    map.clearEffects();
    round.reset();
    fixed.reset();
    setPlaying(true);
  }
  function togglePlay() {
    if (round.finished) restart();
    else { advance(performance.now()); setPlaying(!playing); }
  }
  function toggleDesigner() {
    designer.checked = !designer.checked;
    applyDesigner();
  }
  function applyDesigner() {
    map.clearEffects();
    for (const e of effects) if (e.public || designer.checked) map.spawnEffect(e.effect, e.tick * DT);
    map.setOptions({ designerView: designer.checked });
  }

  playButton.addEventListener('click', togglePlay, on);
  $('#map-restart').addEventListener('click', restart, on);
  labels.addEventListener('change', () => map.setOptions({ showLabels: labels.checked }), on);
  designer.addEventListener('change', applyDesigner, on);
  // Space stays push-to-talk; P/R/L/D are the map keys. Checkboxes still get shortcuts, text fields don't.
  window.addEventListener('keydown', event => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    const checkbox = target instanceof HTMLInputElement && target.type === 'checkbox';
    if (isTypingTarget(target) && !checkbox) return;
    const key = event.key.toLowerCase();
    if (key === 'p') togglePlay();
    else if (key === 'r') restart();
    else if (key === 'l') hooks.toggleMode();
    else if (key === 'd') toggleDesigner();
    else return;
    event.preventDefault();
  }, on);

  // A mouse click leaves focus on the button/checkbox, and a focused control swallows Space, so release
  // focus after pointer use. Keyboard users (Tab + Enter) keep their focus.
  const controls = $('.map-controls');
  controls.addEventListener('pointerup', () => {
    setTimeout(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && controls.contains(active)) active.blur();
    }, 0);
  }, on);

  const observer = typeof IntersectionObserver === 'undefined' ? null
    : new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); });
  observer?.observe(canvas);

  function advance(now: number) {
    const elapsed = now - lastFrame;
    lastFrame = now;
    if (!playing || document.hidden) return;
    fixed.advance(elapsed, scale, () => {
      for (const event of round.step()) {
        effects.push(event);
        if (event.public || designer.checked) map.spawnEffect(event.effect, event.tick * DT);
      }
    });
    if (round.finished) setPlaying(false);
  }

  // Settle the old rate up to the input timestamp, even between two animation frames.
  function syncRate() {
    advance(performance.now());
    scale = timeScale(mode, hooks.isTalking());
  }
  document.addEventListener('visibilitychange', () => { lastFrame = performance.now(); }, on);

  function tick() {
    frame = requestAnimationFrame(tick);
    advance(performance.now());
    const state = round.snapshot(designer.checked, round.finished ? 1 : fixed.alpha);
    set(hud.timerKey, round.finished ? 'Finished' : 'Round');
    set(hud.timer, clock(ROUND_TICKS * DT - round.time));
    const left = round.smokesLeft;
    set(hud.smokes, '●'.repeat(left) + '○'.repeat(3 - left));
    hud.smokes.setAttribute('aria-label', `${left} of 3 smokes left`);
    set(hud.spike, state.spike.state === 'carried' ? 'Carried' : 'Dropped');
    set(hud.mode, mode === 'learn' ? `Learn · ${scale}×` : 'Match · 1×');
    hud.mode.dataset.slow = String(scale < 1);
    if (!visible) return;
    const brim = state.agents.find(a => a.isBrim);
    if (brim) brim.speaking = hooks.isBrimSpeaking();
    map.render(state, round.time + (round.finished ? 0 : fixed.alpha * DT));
  }
  setPlaying(true);
  frame = requestAnimationFrame(tick);

  return {
    setMode(next) { mode = next; syncRate(); },
    syncVoice: syncRate,
    dispose() {
      cancelAnimationFrame(frame);
      listeners.abort();
      observer?.disconnect();
      map.destroy();
    },
  };
}
