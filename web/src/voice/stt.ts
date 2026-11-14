export interface SpeechResult { transcript: string; endedAt: number }
export interface Capture { done: Promise<SpeechResult>; stop(): void; cancel(): void }
// Chrome's prefixed recognition API is not included in TypeScript's DOM library.
export interface Recognition {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
export type RecognitionConstructor = new () => Recognition;

export function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const browser = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return browser.SpeechRecognition || browser.webkitSpeechRecognition;
}

export function startCapture(
  interim: (text: string) => void,
  Constructor = recognitionConstructor(),
  now = () => performance.now(),
  finalTimeoutMs = 2000,
): Capture {
  if (!Constructor) throw new Error('Speech recognition unavailable. Use Chrome or the text input.');
  const recognition = new Constructor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  let finalText = '';
  let settled = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolve!: (result: SpeechResult) => void;
  let reject!: (error: Error) => void;
  const done = new Promise<SpeechResult>((yes, no) => { resolve = yes; reject = no; });
  const cleanup = () => {
    clearTimeout(timer);
    recognition.onresult = recognition.onerror = recognition.onend = null;
  };
  const fail = (error: Error) => {
    if (settled) return;
    settled = true;
    cleanup();
    try { recognition.abort(); } catch { /* Already stopped. */ }
    reject(error);
  };
  recognition.onresult = event => {
    const finals: string[] = [];
    const partials: string[] = [];
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      if (result) (result.isFinal ? finals : partials).push(result[0].transcript);
    }
    finalText = finals.join(' ').trim();
    interim([...finals, ...partials].join(' ').trim());
  };
  recognition.onerror = event => {
    const message = event.error === 'not-allowed' || event.error === 'service-not-allowed'
      ? 'Microphone permission denied. Check Chrome and system permissions, or use text.'
      : event.error === 'audio-capture'
        ? 'Microphone unavailable. Connect a device or use text.'
        : event.error === 'no-speech'
          ? "Didn't catch that. Try again or use text."
          : `Speech recognition failed (${event.error}). Try again or use text.`;
    fail(new Error(message));
  };
  recognition.onend = () => {
    if (settled) return;
    settled = true;
    cleanup();
    resolve({ transcript: finalText, endedAt: now() });
  };
  try {
    recognition.start();
    if (!settled) timer = setTimeout(() => fail(new Error('Microphone listening timed out. Try again.')), 30000);
  } catch (error) { fail(error instanceof Error ? error : new Error('Could not start microphone.')); }
  return {
    done,
    stop() {
      if (settled || stopped) return;
      stopped = true;
      clearTimeout(timer);
      timer = setTimeout(() => fail(new Error('Speech recognition did not finish. Try again or use text.')), finalTimeoutMs);
      try { recognition.stop(); } catch { fail(new Error('Could not finish recognition. Try again.')); }
    },
    cancel() { fail(new DOMException('Capture cancelled.', 'AbortError')); },
  };
}
