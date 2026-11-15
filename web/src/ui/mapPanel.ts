import type { CommandTrace, ConversationRecord, RoundTrace } from '../trace/log.js';
import type { Action, BrimEvent, PlayId } from '../../../shared/schema.js';
import type { Priority } from '../sim/brim.js';
import { hasLOS } from '../map/geometry.js';
import { DEFENDER_SPOTS, PLANT_SPOTS } from '../map/bindA.js';
import { createMapView } from '../map/index.js';
import { Round, ROUND_TICKS, type RoundEvent } from '../sim/round.js';
import { DT, FixedClock, timeScale, type Mode } from '../sim/loop.js';
import { defaultPlay, plays } from '../plays/index.js';
import { isTypingTarget } from '../voice/controls.js';
import type { Conversation } from '../voice/conversation.js';

export type { Mode } from '../sim/loop.js';

export interface MapPanelHooks {
  /** True while push-to-talk is held. Learn mode runs the round at 0.5× during that time. */
  isTalking(): boolean;
  /** True while Brim's voice is playing. Drives the amber pulse on his icon. */
  isBrimSpeaking(): boolean;
  /** Called for the L shortcut, so the voice stage's Learn/Match buttons stay the single control. */
  toggleMode(): void;
  announce(text: string, chip?: string): void;
  voice: Pick<Conversation, 'state' | 'activeCallout' | 'tryCallout' | 'cancel'>;
}

export interface MapPanel {
  readonly phase: Round['phase'];
  readonly round: Round;
  readonly roundId: number;
  trackCommand(trace: CommandTrace): void;
  said(record: ConversationRecord): void;
  trace(): RoundTrace[];
  selectPlay(id: PlayId): boolean;
  readonly brim: Round['brim'];
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

  const query = new URLSearchParams(location.search);
  const param = query.get('seed');
  const lab = import.meta.env.DEV && query.get('agentLab');
  const practice = lab === 'practice';
  const calloutDrill = lab === 'sighting' || lab === 'multiple' || lab === 'cover' ? lab : undefined;
  const round = new Round(param && /^\d{1,10}$/.test(param) ? Number(param) : 2026, { practice, liveDrill: lab === 'live', calloutDrill });
  const status = $('#command-status');
  let command: CommandTrace | undefined;
  let roundId = 1;
  const archive: RoundTrace[] = [];
  const dialogue: BrimEvent[] = [];
  const roundTrace = (end: RoundTrace['end']): RoundTrace => ({
    roundId, seed: round.seed, end, events: [...round.brim.events(), ...round.callouts.events(), ...dialogue].sort((a,b) => a.t - b.t),
  });
  const tag = $('.hud-tag');
  const choices = $('#buy-plays');
  const chips = $('.play-chips');
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

  function showPhase() {
    const buying = round.phase === 'buy';
    choices.hidden = !buying;
    const name = round.play ? plays[round.play].name : practice ? 'Plant drill' : 'Live drill';
    set(tag, (buying ? '' : name + ' · ') + 'Seed ' + round.seed);
    const result = round.outcome === 'win' ? 'Round won' : round.outcome === 'loss' ? 'Round lost' : 'Finished';
    set(hud.timerKey, buying ? 'Buy phase' : round.finished ? result : 'Live');
    set(hud.timer, clock(buying ? round.buyRemainingMs / 1000 : ROUND_TICKS * DT - round.time));
  }

  function selectPlay(id: PlayId) {
    advance(performance.now()); // settle the deadline even between animation frames
    if (!round.selectPlay(id)) return false;
    showPhase();
    return true;
  }

  for (const play of Object.values(plays)) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.textContent = play.name;
    chip.addEventListener('click', () => {
      if (selectPlay(play.id)) hooks.announce(play.confirmation, play.name);
    }, on);
    chips.append(chip);
  }

  function setPlaying(next: boolean) {
    lastFrame = performance.now();
    playing = next;
    playButton.textContent = playing ? 'Pause' : 'Play';
    playButton.setAttribute('aria-pressed', String(!playing));
  }
  function restart() {
    // Canceling a held microphone renders the new voice state and settles the Learn clock.
    // Freeze the departing round before that callback can advance or schedule another turn.
    playing = false;
    effects.length = 0;
    map.clearEffects();
    round.callouts.discardPending('Round restarted');
    hooks.voice.cancel('Round restarted');
    archive.push(roundTrace('restart'));
    roundId++;
    command = undefined;
    dialogue.length = 0;
    set(status, '');
    round.reset();
    fixed.reset();
    setPlaying(true);
    showPhase();
    if (round.phase === 'buy') hooks.announce("What's the call?");
  }
  // Console controls on the live panel only when explicitly requested in dev.
  // Never expose the roster, clock, or mutable world through this interface.
  if (import.meta.env.DEV && lab) {
    const api = {
      addGoal: (action: Action, priority?: Priority) => round.brim.addGoal(action, priority),
      cancelGoal: (id: number) => round.brim.cancelGoal(id),
      clearGoals: () => round.brim.clearGoals(),
      reset: restart,
      events: () => roundTrace('current').events,
      observations: () => round.observations('brim').map(({ id, x, y }) => ({ id, x, y })),
      inspect: () => ({ ...round.brim.inspect(), tick: round.tick, smokes: round.smokesLeft,
        molly: round.mollyLeft, spike: round.snapshot().spike,
        heavenBlocked: !hasLOS(DEFENDER_SPOTS.heaven.pos, PLANT_SPOTS.default, round.activeSmokes()),
        self: round.snapshot().agents.find(a => a.isBrim) }),
    };
    Object.assign(window, { brim: api });
    listeners.signal.addEventListener('abort', () => { Reflect.deleteProperty(window, 'brim'); });
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

  function serviceCallouts() {
    const calls = round.callouts;
    const voice = hooks.voice;
    const active = voice.activeCallout;
    if (active && (!round.canCallout || (voice.state === 'thinking' && !calls.isCurrent(active.sighting)))) {
      voice.cancel(round.canCallout ? 'Sighting changed before playback' : 'Brim died or the round ended');
    }
    if (!round.canCallout || voice.state !== 'idle') return;
    const call = calls.take();
    if (call) voice.tryCallout(call, roundId, (stage, detail) => calls.playback(call, stage, detail));
  }

  function advance(now: number) {
    const elapsed = now - lastFrame;
    lastFrame = now;
    if (!playing || document.hidden) return;
    if (round.phase === 'buy') {
      if (round.advanceBuy(elapsed)) {
        showPhase();
        hooks.announce('Time’s up. ' + plays[defaultPlay].confirmation);
      }
      return;
    }
    fixed.advance(elapsed, scale, () => {
      for (const event of round.step()) {
        effects.push(event);
        if (event.public || designer.checked) map.spawnEffect(event.effect, event.tick * DT);
      }
      serviceCallouts();
    });
    if (round.finished) setPlaying(false);
  }

  // Settle the old rate up to the input timestamp, even between two animation frames.
  function syncRate() {
    const next = timeScale(mode, hooks.isTalking());
    if (scale === next) return;
    if (round.phase === 'live') advance(performance.now());
    scale = next;
  }
  document.addEventListener('visibilitychange', () => {
    lastFrame = performance.now();
    if (document.hidden) {
      round.callouts.discardPending('Tab hidden');
      if (hooks.voice.activeCallout) hooks.voice.cancel('Tab hidden');
    }
  }, on);

  function commandStatus() {
    if (round.brim.recovering) return 'Falling back to plan';
    if (!command || command.thinkMs === undefined) return '';
    if (!command.validator.ok) return command.feedback ?? 'Command failed';
    if (!command.goalIds.length) return 'Continuing current order';
    const states = command.goalIds.map(id => round.brim.goalStatus(id));
    if (states.includes('failed') || states.includes('cancelled')) return 'Command failed';
    if (states.every(s => s === 'done')) return 'Command completed';
    if (states.some(s => s === 'active' || s === 'done')) return 'Command executing';
    return 'Command accepted · queued';
  }
  function tick() {
    frame = requestAnimationFrame(tick);
    advance(performance.now());
    const state = round.snapshot(designer.checked, round.finished ? 1 : fixed.alpha);
    showPhase();
    set(status, commandStatus());
    const left = round.smokesLeft;
    set(hud.smokes, '●'.repeat(left) + '○'.repeat(3 - left));
    hud.smokes.setAttribute('aria-label', `${left} of 3 smokes left`);
    set(hud.spike, state.spike.state[0]!.toUpperCase() + state.spike.state.slice(1));
    set(hud.mode, mode === 'learn' ? `Learn · ${round.phase === 'buy' ? 1 : scale}×` : 'Match · 1×');
    hud.mode.dataset.slow = String(round.phase === 'live' && scale < 1);
    if (!visible) return;
    const brim = state.agents.find(a => a.isBrim);
    if (brim) brim.speaking = hooks.isBrimSpeaking();
    map.render(state, round.time + (round.finished ? 0 : fixed.alpha * DT));
  }
  showPhase();
  setPlaying(true);
  frame = requestAnimationFrame(tick);

  return {
    selectPlay, round, get roundId() { return roundId; },
    trackCommand(trace) { command = trace; },
    said(record) {
      if (record.response) dialogue.push({ t: round.time, kind: 'said', detail: 'Turn ' + record.id + ': ' + record.response.reply });
    },
    trace() { return [...archive, roundTrace('current')]; },
    get phase() { return round.phase; },
    get brim() { return round.brim; },
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
