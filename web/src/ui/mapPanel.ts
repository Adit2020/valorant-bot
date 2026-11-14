// Step 2 integration: the Bind A map panel under the voice stage.
// Owns its own animation loop and sim clock, outside any UI state. Until Step 3 lands, the round is the
// scripted test scene; Step 3 swaps `scene` for the real 20 Hz sim, which emits the same MapState/MapEffect.
import { createMapView } from '../map/index.js';
import { createTestScene } from '../sim/testScene.js';
import { isTypingTarget } from '../voice/controls.js';

export type Mode = 'learn' | 'match';

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
  dispose(): void;
}

const ROUND_SECONDS = 40;
const SPIKE_SECONDS = 45;
const LOOP_PAUSE_SECONDS = 2.5;
const LEARN_TIME_SCALE = 0.5;

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

  const scene = createTestScene();
  const map = createMapView(canvas, { showLabels: labels.checked, designerView: designer.checked });
  const listeners = new AbortController();
  const on = { signal: listeners.signal };

  // Sim time, never wall-clock: Learn-mode slow-mo and effect timings both follow it.
  let simTime = 0;
  let lastSimTime = 0;
  let endedFor = 0;
  let playing = true;
  let mode: Mode = 'learn';
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
    playing = next;
    playButton.textContent = playing ? 'Pause' : 'Play';
    playButton.setAttribute('aria-pressed', String(!playing));
  }
  function restart() {
    map.clearEffects();
    simTime = 0;
    lastSimTime = 0;
    endedFor = 0;
    setPlaying(true);
  }
  function togglePlay() {
    if (!playing && simTime >= scene.duration) restart();
    else setPlaying(!playing);
  }
  function toggleDesigner() {
    designer.checked = !designer.checked;
    map.setOptions({ designerView: designer.checked });
  }

  playButton.addEventListener('click', togglePlay, on);
  $('#map-restart').addEventListener('click', restart, on);
  labels.addEventListener('change', () => map.setOptions({ showLabels: labels.checked }), on);
  designer.addEventListener('change', () => map.setOptions({ designerView: designer.checked }), on);
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

  function updateHud(t: number, timeScale: number) {
    const plantedAt = scene.plantStart + scene.plantDuration;
    if (t < plantedAt) {
      set(hud.timerKey, 'Round');
      set(hud.timer, clock(ROUND_SECONDS - t));
    } else {
      set(hud.timerKey, 'Spike');
      set(hud.timer, clock(SPIKE_SECONDS - (t - plantedAt)));
    }
    const left = Math.max(0, scene.brimSmokesLeft(t));
    set(hud.smokes, '●'.repeat(left) + '○'.repeat(Math.max(0, 3 - left)));
    hud.smokes.setAttribute('aria-label', `${left} of 3 smokes left`);
    set(hud.spike, t < scene.plantStart ? 'Carried'
      : t < plantedAt ? `Planting ${Math.round(((t - scene.plantStart) / scene.plantDuration) * 100)}%`
        : 'Planted · Default');
    set(hud.mode, mode === 'learn' ? `Learn · ${timeScale}×` : 'Match · 1×');
    hud.mode.dataset.slow = String(timeScale < 1);
  }

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    const timeScale = mode === 'learn' && hooks.isTalking() ? LEARN_TIME_SCALE : 1;
    if (playing) {
      if (simTime < scene.duration) simTime = Math.min(scene.duration, simTime + dt * timeScale);
      else if ((endedFor += dt) >= LOOP_PAUSE_SECONDS) restart();
    }
    for (const event of scene.events) if (event.t > lastSimTime && event.t <= simTime) map.spawnEffect(event.effect, event.t);
    lastSimTime = simTime;
    updateHud(simTime, timeScale);
    if (!visible) return;
    const speaking = hooks.isBrimSpeaking();
    const state = scene.stateAt(simTime);
    // The scripted round has no audio of its own, so Brim pulses only while his real voice plays.
    state.agents = state.agents.map(agent => (agent.isBrim ? { ...agent, speaking } : { ...agent, speaking: false }));
    map.render(state, simTime);
  }
  setPlaying(true);
  frame = requestAnimationFrame(tick);

  return {
    setMode(next) { mode = next; },
    dispose() {
      cancelAnimationFrame(frame);
      listeners.abort();
      observer?.disconnect();
      map.destroy();
    },
  };
}
