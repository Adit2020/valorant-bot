export function rms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}
export function readLevel(analyser?: AnalyserNode, samples?: Float32Array<ArrayBuffer>): number {
  if (!analyser || !samples) return 0;
  analyser.getFloatTimeDomainData(samples);
  return Math.min(1, rms(samples) * 5);
}

// Web Speech owns its own capture internally; this single extra stream is for
// metering only. It is never connected to speakers and never blocks recognition.
export class MicrophoneLevels {
  private generation = 0;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  private samples?: Float32Array<ArrayBuffer>;
  private context?: AudioContext;
  private active = false;
  constructor(private notice: (message: string) => void) {}
  start() {
    if (this.active) return;
    this.active = true;
    const id = ++this.generation;
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => undefined);
      void navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        if (id !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
        this.stream = stream;
        this.analyser = this.context!.createAnalyser();
        this.analyser.fftSize = 1024;
        this.samples = new Float32Array(this.analyser.fftSize);
        this.source = this.context!.createMediaStreamSource(stream);
        this.source.connect(this.analyser);
      }).catch(() => { if (id === this.generation) this.notice('Microphone level unavailable. Recognition and text input remain available.'); });
    } catch { this.notice('Microphone level unavailable. Use Chrome on localhost or HTTPS.'); }
  }
  level() { return readLevel(this.analyser, this.samples); }
  stop() {
    if (!this.active) return;
    this.active = false;
    ++this.generation;
    this.stream?.getTracks().forEach(track => track.stop());
    this.source?.disconnect(); this.analyser?.disconnect();
    this.stream = undefined; this.source = undefined; this.analyser = undefined;
    void this.context?.suspend().catch(() => undefined);
  }
  dispose() { this.stop(); void this.context?.close().catch(() => undefined); }
}
