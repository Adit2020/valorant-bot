import { HealthResponseSchema } from '../../shared/schema.js';
import { buyReply, line } from './comms/buyCall.js';
import { liveReply } from './comms/liveCall.js';
import { Conversation } from './voice/conversation.js';
import { bindPushToTalk } from './voice/controls.js';
import { startCapture } from './voice/stt.js';
import { SpeechOutput } from './voice/tts.js';
import { createStudyTrace, downloadTrace, type BotKind } from './trace/log.js';
import { isEvaluation, participantStatus, parseStudy, PHASES, studyUrl } from './trace/study.js';
import { MicrophoneLevels } from './voice/audioLevels.js';
import { Waveform } from './ui/waveform.js';
import { Subtitles } from './ui/subtitles.js';
import { mountMapPanel, type Mode } from './ui/mapPanel.js';
import './styles/theme.css';

const element = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const query = new URLSearchParams(location.search);
const study = (() => {
  try {
    const config = parseStudy(query);
    if (config) {
      const key = `${config.protocol}:${config.dataKind}:${config.participantId}`;
      const assignment = `${config.condition}:${config.order}`;
      const previous = localStorage.getItem(key);
      if (previous && previous !== assignment) throw new Error('This ID already has another group or scenario order in this browser. Restore its original URL or use a new anonymous ID.');
      localStorage.setItem(key, assignment);
    }
    return config;
  } catch (error) {
    document.querySelector('main')!.textContent = 'Study configuration error: ' + (error instanceof Error ? error.message : String(error));
    throw error;
  }
})();
const phase = query.get('phase');
const blinded = study ? isEvaluation(study) : phase === 'pre' || phase === 'post';
// Comparison group for the transfer test: ?bot=plain says "Copy." to everything and never pushes back.
const bot: BotKind = study?.bot ?? (blinded || query.get('bot') === 'plain' ? 'plain' : 'relai');
const backendStatus = element<HTMLParagraphElement>('#backend-status');
async function checkBackend(): Promise<void> {
  try {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Backend unavailable');
    HealthResponseSchema.parse(await response.json());
    backendStatus.textContent = 'Backend connected';
    backendStatus.dataset.connected = 'true';
  } catch { backendStatus.textContent = 'Backend unavailable — check the API server.'; }
}
void checkBackend();

// Study data stays local: no hosted interpretation, hosted synthesis, or cloud-backed recognition.
const speech = new SpeechOutput(!!study);
const mic = new MicrophoneLevels(message => { element('#audio-status').textContent = message; });
const subtitles = new Subtitles(element('#brim-reply'));
let previousState = 'idle';
let logSignature = '';
const talkButton = element<HTMLButtonElement>('#push-to-talk');
const conversation: Conversation = new Conversation({
  capture: interim => startCapture(interim),
  reply: (text, signal) => mapPanel.phase === 'buy'
    ? study ? Promise.resolve(line('Press Start round when ready.', 'local')) : buyReply(text, signal, mapPanel.selectPlay)
    : liveReply(mapPanel.round, mapPanel.roundId, mode, text, signal, trace => {
      conversation.records.at(-1)!.command = trace;
      mapPanel.trackCommand(trace);
    }, study ? async () => { throw new Error('Study uses local keyword interpretation.'); } : undefined, { plain: bot === 'plain', evaluation: blinded }),
  liveClock: () => mapPanel.phase === 'live' && !mapPanel.round.finished
    ? { roundId: mapPanel.roundId, tick: mapPanel.round.tick } : undefined,
  said: (record) => mapPanel.said(record),
  speak: (...args) => speech.speak(...args),
  stopAudio: () => speech.stop(), unlockAudio: () => speech.unlock(),
  now: () => performance.now(), update: () => render(),
});
const waveform = new Waveform(element<HTMLCanvasElement>('#waveform'), () => {
  const visual = speech.visual();
  if (conversation.state === 'speaking') subtitles.highlight(visual.word);
  return conversation.state === 'listening' ? mic.level() : conversation.state === 'speaking' ? visual.level : 0;
});
function render() {
  const { state } = conversation;
  const holding = conversation.isHolding;
  mapPanel.syncVoice();
  if (holding) mic.start(); else mic.stop();
  element('.voice-stage').dataset.state = state;
  waveform.setState(state);
  element('#voice-state').textContent = state;
  talkButton.setAttribute('aria-pressed', String(holding));
  element('#transcript').textContent = conversation.transcript ? `you: ${conversation.transcript}` : '';
  if (conversation.response) subtitles.show(conversation.response.reply);
  else subtitles.clear();
  if (previousState === 'speaking' && state !== 'speaking') subtitles.finish();
  // A failed audio attempt still leaves the received subtitle visible.
  if (state === 'idle' && conversation.records.at(-1)?.status === 'completed') subtitles.finish();
  previousState = state;
  element('#voice-status').textContent = participantStatus(state, conversation.message, blinded || study?.condition === 'C', conversation.records.at(-1)?.error);
  element('#voice-status').dataset.error = String(conversation.records.at(-1)?.status === 'failed');
  const signature = JSON.stringify(conversation.records);
  if (signature === logSignature) return;
  logSignature = signature;
  element('#turn-count').textContent = String(conversation.records.length);
  const log = element<HTMLOListElement>('#chat-log');
  log.replaceChildren(...conversation.records.map(record => {
    const row = document.createElement('li');
    const detail = document.createElement('p');
    detail.className = 'log-detail';
    detail.textContent = `#${conversation.records.indexOf(record)+1} · ${record.t.toFixed(1)}s · ${record.status} · ${record.callout ? 'enemy sighting' : record.source === 'local' ? 'local fallback' : record.source || record.input}${record.audio ? ` · ${record.audio}` : ''}${record.error ? ` · ${record.error}` : ''}${record.notices.length ? ` · ${record.notices.at(-1)}` : ''}`;
    row.append(detail);
    for (const [speaker,message] of [['You',record.transcript || (record.input === 'voice' ? '(no final transcript)' : '')], ['RelAI',record.response?.reply]]) {
      if (!message) continue;
      const line = document.createElement('p');
      const label = document.createElement('span'); label.className = 'speaker'; label.textContent = speaker!;
      line.append(label, document.createTextNode(message)); row.append(line);
    }
    return row;
  }));
}
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-mode]')];
let mode: Mode = study?.mode ?? (blinded ? 'match' : 'learn');
const mapPanel = mountMapPanel(element('.map-panel'), {
  isTalking: () => conversation.isHolding,
  isBrimSpeaking: () => conversation.state === 'speaking',
  announce: (text, chip) => conversation.announce(line(text, 'round'), chip),
  voice: conversation,
  bot, blinded, study, records: () => conversation.records,
  toggleMode: () => setMode(mode === 'learn' ? 'match' : 'learn'),
});
if (blinded || study) {
  for (const button of modeButtons) button.disabled = true;
  setMode(mode);
}
if (mapPanel.phase === 'buy' && !study) conversation.announce(line("What's the call?", 'round'));
function setMode(next: Mode) {
  mode = study?.mode ?? (blinded ? 'match' : next);
  modeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  mapPanel.setMode(mode);
}
modeButtons.forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode === 'match' ? 'match' : 'learn')));
const unbind = study ? () => {} : bindPushToTalk(talkButton, conversation);
if (study) {
  element('main').classList.add('study-mode');
  talkButton.disabled = true;
  talkButton.title = 'Local study uses text to avoid cloud speech recognition.';
  talkButton.querySelector('span')!.textContent = 'Study: type your call below';
  element('#voice-status').textContent = 'Local study: use the text box. Hosted speech and interpretation are disabled.';
}
element<HTMLFormElement>('#text-form').addEventListener('submit', event => {
  event.preventDefault();
  conversation.submitText(element<HTMLInputElement>('#message').value);
});
element('#stop').addEventListener('click', () => conversation.cancel());
const sessionId = crypto.randomUUID();
let startedAt = new Date().toISOString();
let downloadNumber = 0;
let studyStarted = false;
let exportedComplete = false;
const studyPanel = document.createElement('section');
studyPanel.id = 'study-panel';
studyPanel.className = 'round-results';
const studyStatus = document.createElement('p');
const next = document.createElement('a');
if (study) {
  const label = document.createElement('p');
  label.textContent = `${study.participantId} · ${study.phase} · ${study.play.replaceAll('_', ' ')} · ${study.mode}`;
  const instruction = document.createElement('p');
  instruction.textContent = 'Report enemies you can see and direct your teammate using the text box. This study keeps input local; microphone recognition and hosted services are disabled. Wait until the round ends, then download its trace before continuing.';
  const start = document.createElement('button');
  start.id = 'study-start'; start.textContent = 'Start round';
  start.addEventListener('click', () => {
    if (!mapPanel.startStudy()) return;
    startedAt = new Date().toISOString(); studyStarted = true; start.disabled = true;
    instruction.hidden = true; start.hidden = true;
    studyStatus.textContent = 'Round running. Download the trace after it finishes.';
  });
  const nextPhase = PHASES[PHASES.indexOf(study.phase) + 1];
  if (nextPhase) { next.href = studyUrl(study, nextPhase); next.textContent = `Continue to ${nextPhase}`; }
  next.id = 'study-next'; next.hidden = true;
  studyStatus.id = 'study-status'; studyStatus.textContent = 'Ready. The round starts when you press Start round.';
  studyPanel.append(label, instruction, start, studyStatus, next);
  element('main').prepend(studyPanel);
  window.addEventListener('beforeunload', event => {
    if (studyStarted && !exportedComplete) { event.preventDefault(); event.returnValue = ''; }
  });
}
element('#export-trace').addEventListener('click', () => {
  const rounds = mapPanel.trace();
  const file = study ? createStudyTrace(conversation.records, rounds, study, sessionId, startedAt) : undefined;
  const filename = downloadTrace(conversation.records, rounds, bot, file, ++downloadNumber);
  if (study) {
    exportedComplete = file!.study!.completion === 'complete';
    studyStatus.textContent = `Download requested: ${filename}. ${exportedComplete ? 'Confirm it is in Downloads before continuing.' : 'INCOMPLETE: finish the round and download again.'}`;
    next.hidden = !exportedComplete || !next.href;
    if (exportedComplete && study.phase === 'post') studyStatus.textContent += ' Session finished. Ask the experimenter to check all six files.';
  }
});
window.addEventListener('pagehide', () => { unbind(); mapPanel.dispose(); waveform.dispose(); subtitles.dispose(); mic.dispose(); speech.dispose(); }, { once: true });

if (import.meta.env.DEV && !study) {
  element('#mic-check').hidden = false;
  const button = element<HTMLButtonElement>('#test-mic');
  const status = element('#mic-status');
  button.addEventListener('click', async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      status.textContent = 'Microphone unavailable. Use Chrome on localhost or HTTPS.';
      return;
    }
    conversation.cancel('Testing microphone permission.');
    button.disabled = true;
    status.textContent = 'Waiting for microphone permission…';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      status.textContent = 'Microphone permission granted. All tracks stopped.';
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      status.textContent = name === 'NotAllowedError'
        ? 'Microphone permission denied. Check Chrome and system permissions.'
        : name === 'NotFoundError' ? 'No microphone found. Connect a device and try again.'
          : 'Microphone unavailable or busy. Check the device and try again.';
    } finally { button.disabled = false; }
  });
}
