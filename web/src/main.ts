import { HealthResponseSchema } from '../../shared/schema.js';
import { buyReply, line } from './comms/buyCall.js';
import { liveReply } from './comms/liveCall.js';
import { Conversation } from './voice/conversation.js';
import { bindPushToTalk } from './voice/controls.js';
import { startCapture } from './voice/stt.js';
import { SpeechOutput } from './voice/tts.js';
import { downloadTrace } from './trace/log.js';
import { MicrophoneLevels } from './voice/audioLevels.js';
import { Waveform } from './ui/waveform.js';
import { Subtitles } from './ui/subtitles.js';
import { mountMapPanel, type Mode } from './ui/mapPanel.js';
import './styles/theme.css';

const element = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
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

const speech = new SpeechOutput();
const mic = new MicrophoneLevels(message => { element('#audio-status').textContent = message; });
const subtitles = new Subtitles(element('#brim-reply'));
let previousState = 'idle';
let logSignature = '';
const talkButton = element<HTMLButtonElement>('#push-to-talk');
const conversation: Conversation = new Conversation({
  capture: interim => startCapture(interim),
  reply: (text, signal) => mapPanel.phase === 'buy'
    ? buyReply(text, signal, mapPanel.selectPlay)
    : liveReply(mapPanel.round, mapPanel.roundId, mode, text, signal, trace => {
      conversation.records.at(-1)!.command = trace;
      mapPanel.trackCommand(trace);
    }),
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
  element('#voice-status').textContent = conversation.message;
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
    detail.textContent = `#${conversation.records.indexOf(record)+1} · ${record.t.toFixed(1)}s · ${record.status} · ${record.source === 'local' ? 'local fallback' : record.source || record.input}${record.audio ? ` · ${record.audio}` : ''}${record.error ? ` · ${record.error}` : ''}${record.notices.length ? ` · ${record.notices.at(-1)}` : ''}`;
    row.append(detail);
    for (const [speaker,message] of [['You',record.transcript || (record.input === 'voice' ? '(no final transcript)' : '')], ['Brim',record.response?.reply]]) {
      if (!message) continue;
      const line = document.createElement('p');
      const label = document.createElement('span'); label.className = 'speaker'; label.textContent = speaker!;
      line.append(label, document.createTextNode(message)); row.append(line);
    }
    return row;
  }));
}
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-mode]')];
let mode: Mode = 'learn';
const mapPanel = mountMapPanel(element('.map-panel'), {
  isTalking: () => conversation.isHolding,
  isBrimSpeaking: () => conversation.state === 'speaking',
  announce: (text, chip) => conversation.announce(line(text, 'round'), chip),
  resetVoice: () => conversation.cancel(),
  toggleMode: () => setMode(mode === 'learn' ? 'match' : 'learn'),
});
if (mapPanel.phase === 'buy') conversation.announce(line("What's the call?", 'round'));
function setMode(next: Mode) {
  mode = next;
  modeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === next)));
  mapPanel.setMode(next);
}
modeButtons.forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode === 'match' ? 'match' : 'learn')));
const unbind = bindPushToTalk(talkButton, conversation);
element<HTMLFormElement>('#text-form').addEventListener('submit', event => {
  event.preventDefault();
  conversation.submitText(element<HTMLInputElement>('#message').value);
});
element('#stop').addEventListener('click', () => conversation.cancel());
element('#export-trace').addEventListener('click', () => downloadTrace(conversation.records, mapPanel.trace()));
window.addEventListener('pagehide', () => { unbind(); mapPanel.dispose(); waveform.dispose(); subtitles.dispose(); mic.dispose(); speech.dispose(); }, { once: true });

if (import.meta.env.DEV) {
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
