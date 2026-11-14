import { readLevel } from './audioLevels.js';
import { estimatedWord, wordAt } from '../ui/subtitles.js';
import type { ConversationRecord } from '../trace/log.js';
type AudioMode = NonNullable<ConversationRecord['audio']>;

function waitFor(target: EventTarget, event: string, signal: AbortSignal, action?: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(event, success);
      target.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted);
    };
    const success = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error('Audio stream could not be decoded.')); };
    const aborted = () => { cleanup(); reject(signal.reason); };
    if (signal.aborted) { aborted(); return; }
    target.addEventListener(event, success, { once: true });
    target.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', aborted, { once: true });
    try { action?.(); } catch (error) { cleanup(); reject(error); }
  });
}

export async function withSpeechFallback(
  hosted: () => Promise<void>, browser: () => Promise<void>, signal: AbortSignal,
  notice: (message: string) => void,
): Promise<void> {
  try { await hosted(); }
  catch (error) {
    if (signal.aborted) throw signal.reason;
    notice(`Hosted TTS unavailable; using browser voice. ${error instanceof Error ? error.message : ''}`.trim());
    await browser();
  }
}

export class SpeechOutput {
  private audio = new Audio();
  private context?: AudioContext;
  analyser?: AnalyserNode;
  private abort?: AbortController;
  private visualMode: AudioMode | null = null;
  private startedAt = 0;
  private boundaryAt = -Infinity;
  private boundaryWord = -1;
  private text = '';
  private samples = new Float32Array(2048);
  visual() {
    const elapsed = (performance.now() - this.startedAt) / 1000;
    const count = this.text.split(/\s+/u).length;
    const browser = this.visualMode === 'browser';
    const duration = !browser && Number.isFinite(this.audio.duration) ? this.audio.duration : count / 2.6;
    return {
      level: !this.visualMode ? 0 : browser
        ? Math.min(1, .16 + .3 * Math.abs(Math.sin(elapsed * 9)) + .45 * Math.exp(-(performance.now() - this.boundaryAt) / 150))
        : readLevel(this.analyser, this.samples),
      word: browser && this.boundaryWord >= 0 ? this.boundaryWord
        : estimatedWord(count, browser ? elapsed : this.audio.currentTime, duration),
    };
  }

  constructor() { this.audio.preload = 'auto'; }

  unlock() {
    // Create/resume in the user's gesture. One media source per audio element.
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.analyser = this.context.createAnalyser();
        this.analyser.connect(this.context.destination);
      }
      void this.context.resume().catch(() => undefined);
    } catch { /* Hosted playback or browser synthesis will report real failures. */ }
  }

  private resetAudio(audio = this.audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }

  stop() {
    this.abort?.abort(new DOMException('Speech interrupted.', 'AbortError'));
    this.resetAudio();
    this.visualMode = null;
    window.speechSynthesis?.cancel();
  }

  async speak(text: string, parent: AbortSignal, started: (mode: AudioMode) => void, notice: (message: string) => void) {
    this.stop();
    this.abort = new AbortController();
    const signal = AbortSignal.any([parent, this.abort.signal, AbortSignal.timeout(30000)]);
    if (signal.aborted) throw signal.reason;
    const owner = this.abort;
    this.text = text; this.boundaryWord = -1; this.boundaryAt = -Infinity;
    const visualStarted = (mode: AudioMode) => {
      if (signal.aborted) return;
      this.visualMode = mode; this.startedAt = performance.now(); started(mode);
    };
    try {
      await withSpeechFallback(
        () => this.hosted(text, signal, visualStarted, notice),
        () => this.browser(text, signal, visualStarted), signal, notice,
      );
    } finally { if (this.abort === owner) this.visualMode = null; }
  }

  private async hosted(text: string, parent: AbortSignal, started: (mode: AudioMode) => void, notice: (message: string) => void) {
    const attempt = new AbortController();
    const signal = AbortSignal.any([parent, attempt.signal, AbortSignal.timeout(18000)]);
    // Each attempt owns its media element: stale cleanup cannot stop a newer turn.
    const audio = new Audio();
    audio.preload = 'auto';
    this.audio = audio;
    let source: MediaElementAudioSourceNode | undefined;
    let url: string | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const aborted = () => this.resetAudio(audio);
    signal.addEventListener('abort', aborted, { once: true });
    try {
      const response = await fetch('/api/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }), signal,
      });
      if (!response.ok || !response.body) {
        const error = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(error?.error?.message || `Hosted TTS failed (${response.status}).`);
      }
      if (this.context) {
        // unlock() already requested resume in a user gesture. Do not await a
        // resume here: autoplay policy may leave that promise pending forever.
        if (this.context.state !== 'running') throw new Error('Audio blocked. Click Send or the microphone button to enable playback.');
        source = this.context.createMediaElementSource(audio);
        source.connect(this.analyser!);
      }
      if (typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('audio/mpeg')) {
        const media = new MediaSource();
        url = URL.createObjectURL(media);
        await waitFor(media, 'sourceopen', signal, () => { audio.src = url!; audio.load(); });
        const buffer = media.addSourceBuffer('audio/mpeg');
        reader = response.body.getReader();
        const playback = this.playback(audio, signal, () => started('hosted-stream'));
        const pump = async () => {
          let playing = false;
          while (true) {
            const chunk = await reader!.read();
            if (chunk.done) break;
            if (signal.aborted) throw signal.reason;
            await waitFor(buffer, 'updateend', signal, () => buffer.appendBuffer(new Uint8Array(chunk.value).buffer));
            if (!playing) { playing = true; playback.play(); }
          }
          if (!playing) throw new Error('Hosted TTS returned empty audio.');
          if (media.readyState === 'open') media.endOfStream();
        };
        await Promise.all([pump(), playback.done]);
      } else {
        notice('Streaming MP3 playback unavailable in this browser; buffering hosted audio.');
        // Compatibility fallback only: explicitly waits for the whole file.
        const blob = await response.blob();
        if (signal.aborted) throw signal.reason;
        url = URL.createObjectURL(blob);
        audio.src = url;
        const playback = this.playback(audio, signal, () => started('hosted-buffered'));
        playback.play();
        await playback.done;
      }
    } finally {
      attempt.abort();
      signal.removeEventListener('abort', aborted);
      this.resetAudio(audio);
      source?.disconnect();
      if (reader) { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      if (url) URL.revokeObjectURL(url);
    }
  }

  private playback(audio: HTMLAudioElement, signal: AbortSignal, started: () => void) {
    let rejectPlayback!: (error: unknown) => void;
    const done = new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        audio.removeEventListener('playing', playing);
        audio.removeEventListener('ended', ended);
        audio.removeEventListener('error', failed);
        signal.removeEventListener('abort', aborted);
      };
      const playing = () => started();
      const ended = () => { cleanup(); resolve(); };
      const failed = () => rejectPlayback(new Error('Audio playback failed. Check browser audio permissions.'));
      const aborted = () => rejectPlayback(signal.reason);
      rejectPlayback = error => { cleanup(); reject(error); };
      audio.addEventListener('playing', playing, { once: true });
      audio.addEventListener('ended', ended, { once: true });
      audio.addEventListener('error', failed, { once: true });
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) aborted();
    });
    return { done, play: () => { void audio.play().catch(rejectPlayback); } };
  }

  private browser(text: string, signal: AbortSignal, started: (mode: AudioMode) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const synth = window.speechSynthesis;
      if (!synth) { reject(new Error('Speech synthesis unavailable. Brim’s reply remains visible.')); return; }
      if (signal.aborted) { reject(signal.reason); return; }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      const voice = synth.getVoices().find(voice => voice.lang.startsWith('en'));
      if (voice) utterance.voice = voice;
      const cleanup = () => {
        utterance.onstart = utterance.onend = utterance.onerror = utterance.onboundary = null;
        signal.removeEventListener('abort', aborted);
      };
      const aborted = () => { cleanup(); synth.cancel(); reject(signal.reason); };
      utterance.onboundary = event => {
        if (signal.aborted) return;
        this.boundaryWord = wordAt(text, event.charIndex); this.boundaryAt = performance.now();
      };
      utterance.onstart = () => started('browser');
      utterance.onend = () => { cleanup(); resolve(); };
      utterance.onerror = event => { cleanup(); reject(new Error(`Browser speech failed (${event.error}). Check audio permissions and try again.`)); };
      signal.addEventListener('abort', aborted, { once: true });
      try { synth.speak(utterance); } catch (error) { cleanup(); reject(error); }
    });
  }

  dispose() {
    this.stop();
    this.analyser?.disconnect();
    void this.context?.close();
  }
}
