// Dev-only sandbox for the Bind A map: open /sandbox.html while `npm run dev` runs.
// Scrub the scripted round, toggle designer view, and copy coordinates for bindA.ts.
import './sandbox.css';
import { REGION_BY_ID, createMapView, regionAt, type Vec } from '../map/index.js';
import { createTestScene } from '../sim/testScene.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const scene = createTestScene();
const params = new URLSearchParams(location.search);

const canvas = $<HTMLCanvasElement>('map');
const map = createMapView(canvas, {
  showLabels: params.get('labels') !== '0',
  designerView: params.get('designer') === '1',
  showNav: params.get('nav') === '1',
});

// ---------- clock ----------
let simTime = Math.max(0, Math.min(scene.duration, Number(params.get('t')) || 0));
let playing = params.get('pause') !== '1';
let learnMode = params.get('mode') === 'learn';
let lastSimTime = simTime;
let lastFrame = performance.now();

function respawnUpTo(t: number) {
  map.clearEffects();
  for (const ev of scene.events) if (ev.t <= t) map.spawnEffect(ev.effect, ev.t);
  lastSimTime = t;
}
respawnUpTo(simTime);

// ---------- controls ----------
const playBtn = $<HTMLButtonElement>('playBtn');
const scrub = $<HTMLInputElement>('scrub');
const modeBtn = $<HTMLButtonElement>('modeBtn');
scrub.max = String(scene.duration);

function setPlaying(p: boolean) {
  playing = p;
  playBtn.textContent = playing ? 'Pause' : 'Play';
}
function restart() {
  simTime = 0;
  respawnUpTo(0);
  setPlaying(true);
}
function toggleMode() {
  learnMode = !learnMode;
  modeBtn.textContent = learnMode ? 'Learn · 0.5×' : 'Match · 1×';
  modeBtn.classList.toggle('learn', learnMode);
}
setPlaying(playing);
if (learnMode) {
  learnMode = false;
  toggleMode();
}

playBtn.onclick = () => {
  if (!playing && simTime >= scene.duration) restart();
  else setPlaying(!playing);
};
$('restartBtn').onclick = restart;
modeBtn.onclick = toggleMode;
scrub.oninput = () => {
  const t = Number(scrub.value);
  setPlaying(false);
  if (t < lastSimTime) respawnUpTo(t);
  simTime = t;
};

const bindToggle = (id: string, key: 'showLabels' | 'designerView' | 'showNav') => {
  const el = $<HTMLInputElement>(id);
  el.checked = map.getOptions()[key];
  el.onchange = () => map.setOptions({ [key]: el.checked });
};
bindToggle('optLabels', 'showLabels');
bindToggle('optDesigner', 'designerView');
bindToggle('optNav', 'showNav');

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'checkbox') return;
  const k = e.key.toLowerCase();
  if (k === 'p') playBtn.click();
  else if (k === 'r') restart();
  else if (k === 'l') toggleMode();
  else if (k === 'd') {
    const el = $<HTMLInputElement>('optDesigner');
    el.checked = !el.checked;
    el.onchange?.(new Event('change'));
  }
});

// ---------- coordinate tool (click = point, shift+drag = rectangle) ----------
const hoverEl = $('hover');
const copiedEl = $('copied');
const dragBox = $('dragBox');
const wrap = $('mapWrap');
let dragStart: { world: Vec; px: Vec } | null = null;

const round = (v: number) => Math.round(v);
const fmtPt = (p: Vec) => `[${round(p[0])}, ${round(p[1])}]`;

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copiedEl.textContent = `${text}  copied`;
  } catch {
    copiedEl.textContent = `${text}  (copy blocked; select it here)`;
  }
  console.log(text);
}

canvas.addEventListener('mousemove', (e) => {
  const w = map.clientToWorld(e.clientX, e.clientY);
  const reg = regionAt(w[0], w[1]);
  hoverEl.textContent = `${fmtPt(w)}  ${reg ? REGION_BY_ID[reg].name : 'wall'}`;
  if (dragStart) {
    const r = wrap.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    Object.assign(dragBox.style, {
      left: `${Math.min(x, dragStart.px[0])}px`,
      top: `${Math.min(y, dragStart.px[1])}px`,
      width: `${Math.abs(x - dragStart.px[0])}px`,
      height: `${Math.abs(y - dragStart.px[1])}px`,
    });
  }
});
canvas.addEventListener('mousedown', (e) => {
  const r = wrap.getBoundingClientRect();
  const world = map.clientToWorld(e.clientX, e.clientY);
  if (e.shiftKey) {
    dragStart = { world, px: [e.clientX - r.left, e.clientY - r.top] };
    dragBox.hidden = false;
    Object.assign(dragBox.style, { left: `${dragStart.px[0]}px`, top: `${dragStart.px[1]}px`, width: '0px', height: '0px' });
  } else {
    void copy(fmtPt(world));
  }
});
window.addEventListener('mouseup', (e) => {
  if (!dragStart) return;
  const end = map.clientToWorld(e.clientX, e.clientY);
  const a = dragStart.world;
  const rect = `[${round(Math.min(a[0], end[0]))}, ${round(Math.min(a[1], end[1]))}, ${round(Math.max(a[0], end[0]))}, ${round(Math.max(a[1], end[1]))}]`;
  void copy(rect);
  dragStart = null;
  dragBox.hidden = true;
});

// ---------- HUD ----------
const hudTimer = $('hudTimer');
const hudTimerK = $('hudTimerK');
const hudSmokes = $('hudSmokes');
const hudSpike = $('hudSpike');
const timeLabel = $('timeLabel');
const fmtClock = (s: number) => {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};

function updateHud(t: number) {
  const plantedAt = scene.plantStart + scene.plantDuration;
  if (t < plantedAt) {
    hudTimerK.textContent = 'ROUND';
    hudTimer.textContent = fmtClock(40 - t);
  } else {
    hudTimerK.textContent = 'SPIKE';
    hudTimer.textContent = fmtClock(45 - (t - plantedAt));
  }
  const left = scene.brimSmokesLeft(t);
  hudSmokes.textContent = '●'.repeat(left) + '○'.repeat(3 - left);
  hudSpike.textContent =
    t < scene.plantStart ? 'Carried · SOV' : t < plantedAt ? `Planting ${Math.round(((t - scene.plantStart) / scene.plantDuration) * 100)}%` : 'Planted · Default';
  timeLabel.textContent = `${t.toFixed(1)} s`;
  if (document.activeElement !== scrub) scrub.value = String(t);
}

// ---------- main loop ----------
function frame(now: number) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (playing) {
    simTime = Math.min(scene.duration, simTime + dt * (learnMode ? 0.5 : 1));
    if (simTime >= scene.duration) setPlaying(false);
  }
  for (const ev of scene.events) if (ev.t > lastSimTime && ev.t <= simTime) map.spawnEffect(ev.effect, ev.t);
  lastSimTime = simTime;

  map.render(scene.stateAt(simTime), simTime);
  updateHud(simTime);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// handy in the console while tweaking
Object.assign(window, { map, scene });
