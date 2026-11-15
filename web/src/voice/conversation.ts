import type { BrimResponse } from '../../../shared/schema.js';
import { BrimRequestSchema } from '../../../shared/schema.js';
import type { EnemyCallout, PlaybackStage } from '../comms/calloutGen.js';
import { line } from '../comms/buyCall.js';
import type { ReplyResult } from '../comms/brimClient.js';
import { attachTurnLog, type ConversationRecord, type ConversationState } from '../trace/log.js';
import type { Capture, SpeechResult } from './stt.js';

export interface ConversationDependencies {
  capture(interim: (text: string) => void): Capture;
  reply(transcript: string, signal: AbortSignal): Promise<ReplyResult>;
  speak(text: string, signal: AbortSignal, started: (mode: NonNullable<ConversationRecord['audio']>) => void, notice: (message: string) => void): Promise<void>;
  said?(record: ConversationRecord): void;
  stopAudio(): void;
  unlockAudio(): void;
  now(): number;
  update(): void;
}

export class Conversation {
  state: ConversationState = 'idle';
  transcript = '';
  response: BrimResponse | null = null;
  message = 'Hold Space to talk, or type a message.';
  records: ConversationRecord[] = [];
  private automatic?: { call: EnemyCallout; report(stage: PlaybackStage, detail?: string): void };
  get activeCallout() { return this.automatic?.call; }

  private generation = 0;
  private current?: ConversationRecord;
  private abort?: AbortController;
  private capture?: Capture;
  private releasedAt?: number;
  private recognitionResult?: SpeechResult;
  private readonly origin: number;

  constructor(private deps: ConversationDependencies) { this.origin = deps.now(); }

  get isHolding(): boolean { return this.state === 'listening' && this.releasedAt === undefined; }

  private changed() { this.deps.update(); }
  private newRecord(input: ConversationRecord['input']) {
    const record: ConversationRecord = {
      id: this.generation, t: (this.deps.now() - this.origin) / 1000, input,
      transcript: '', source: null, audio: null, status: 'pending', notices: [],
      latencyMs: { stt: null, think: null, firstAudio: null },
    };
    this.current = record;
    this.records.push(record);
    this.transcript = '';
    this.response = null;
    return record;
  }

  cancel(message = 'Interrupted. Ready for your next call.') {
    this.interrupt(message);
    this.changed();
  }

  // Replacement turns publish their new state atomically. Rendering an interim idle
  // state could settle the Learn clock and let a sighting reserve the channel.
  private interrupt(message: string) {
    ++this.generation;
    if (this.automatic) {
      this.automatic.report('canceled', message);
      this.automatic = undefined;
    }
    if (this.records.at(-1)?.input === 'callout') this.response = null;
    this.abort?.abort();
    this.capture?.cancel();
    this.capture = undefined;
    this.recognitionResult = undefined;
    this.releasedAt = undefined;
    this.deps.stopAudio();
    if (this.current?.status === 'pending') this.current.status = 'interrupted';
    this.current = undefined;
    this.state = 'idle';
    this.message = message;
  }

  beginListening() {
    if (this.state === 'listening' && this.releasedAt === undefined) return;
    this.interrupt('Player pressed push-to-talk'); // Stop speech before requesting microphone access.
    this.deps.unlockAudio();
    const id = this.generation;
    const record = this.newRecord('voice');
    this.state = 'listening';
    this.message = 'Listening… release to send.';
    this.changed();
    try {
      this.capture = this.deps.capture(text => {
        if (id !== this.generation) return;
        this.transcript = record.transcript = text;
        this.changed();
      });
      void this.capture.done.then(result => {
        if (id !== this.generation) return;
        this.recognitionResult = result;
        if (this.releasedAt !== undefined) this.finishRecognition(id, record);
      }).catch(error => this.fail(id, record, error));
    } catch (error) { this.fail(id, record, error); }
  }

  release() {
    if (this.state !== 'listening' || this.releasedAt !== undefined) return;
    this.releasedAt = this.deps.now();
    this.message = 'Finishing transcript…';
    this.changed();
    this.capture?.stop();
    if (this.recognitionResult) this.finishRecognition(this.generation, this.current!);
  }

  private finishRecognition(id: number, record: ConversationRecord) {
    const result = this.recognitionResult!;
    record.latencyMs.stt = Math.max(0, result.endedAt - this.releasedAt!);
    this.capture = undefined;
    void this.send(id, record, result.transcript, this.releasedAt!);
  }

  submitText(text: string) {
    const parsed = BrimRequestSchema.safeParse({ transcript: text });
    if (!parsed.success) {
      this.message = 'Enter a message of 1–2000 characters.';
      this.changed();
      return;
    }
    this.interrupt('Player submitted a text command');
    this.deps.unlockAudio();
    const record = this.newRecord('text');
    void this.send(this.generation, record, parsed.data.transcript, this.deps.now());
  }

  announce(result: ReplyResult, chip?: string) {
    this.interrupt('Round announcement');
    if (chip) this.deps.unlockAudio();
    const record = this.newRecord(chip ? 'chip' : 'round');
    record.transcript = chip ?? '';
    this.abort = new AbortController();
    this.state = 'thinking';
    void this.deliver(this.generation, record, result, this.deps.now(), this.abort.signal)
      .catch(error => this.fail(record.id, record, error));
  }

  tryCallout(call: EnemyCallout, roundId: number, report: (stage: PlaybackStage, detail?: string) => void): boolean {
    if (this.state !== 'idle') return false;
    const id = ++this.generation;
    const record = this.newRecord('callout');
    record.callout = { roundId, sightingId: call.sighting.id };
    this.automatic = { call, report };
    this.abort = new AbortController();
    const signal = this.abort.signal;
    const scheduled = this.deps.now();
    this.state = 'thinking';
    // Reserve the channel synchronously. UI and network work run outside the fixed tick.
    queueMicrotask(() => {
      if (id === this.generation) void this.deliver(id, record, line(call.text, 'round'), scheduled, signal)
        .catch(error => this.fail(id, record, error));
    });
    return true;
  }

  private async send(id: number, record: ConversationRecord, transcript: string, speechEnd: number) {
    if (id !== this.generation) return;
    const parsed = BrimRequestSchema.safeParse({ transcript });
    if (!parsed.success) { this.fail(id, record, new Error("Didn't catch a final transcript. Try again or use text.")); return; }
    this.transcript = record.transcript = parsed.data.transcript;
    this.state = 'thinking';
    this.message = 'Waiting for Brim…';
    this.abort = new AbortController();
    const signal = this.abort.signal;
    const thinkStart = this.deps.now();
    this.changed();
    try {
      const result = await this.deps.reply(record.transcript, signal);
      if (id !== this.generation) return;
      record.latencyMs.think = this.deps.now() - thinkStart;
      await this.deliver(id, record, result, speechEnd, signal);
    } catch (error) { this.fail(id, record, error); }
  }

  private async deliver(id: number, record: ConversationRecord, result: ReplyResult, speechEnd: number, signal: AbortSignal) {
    const label = record.callout ? 'Enemy sighting' : record.command ? (record.command.validator.ok ? 'Command accepted' : 'Command failed') : { local: 'Local fallback', openai: 'OpenAI', keyword: 'Play call', round: 'Round' }[result.source];
    record.response = this.response = result.response;
    record.source = result.source;
    this.message = `${label} reply. Preparing speech…`;
    this.changed();
    await this.deps.speak(result.response.reply, signal, mode => {
      if (id !== this.generation) return;
      if (record.latencyMs.firstAudio === null) {
        record.latencyMs.firstAudio = this.deps.now() - speechEnd;
        if (this.automatic) this.automatic.report('started');
        else this.deps.said?.(record);
      }
      record.audio = mode;
      this.state = 'speaking';
      this.message = `${label} · ${mode}`;
      this.changed();
    }, notice => {
      if (id !== this.generation) return;
      record.notices.push(notice);
      this.message = notice;
      this.changed();
    });
    if (id !== this.generation) return;
    if (this.automatic) {
      if (record.latencyMs.firstAudio === null) throw new Error('Playback ended without a speech-start signal.');
      this.automatic.report('completed');
      this.automatic = undefined;
    }
    record.status = 'completed';
    attachTurnLog(record);
    this.state = 'idle';
    this.message = `${label} · Ready for another call.${record.notices.length ? ' ' + record.notices.at(-1) : ''}`;
    this.current = undefined;
    this.changed();
  }

  private fail(id: number, record: ConversationRecord, error: unknown) {
    if (id !== this.generation) return;
    this.abort?.abort();
    this.deps.stopAudio();
    record.status = 'failed';
    record.error = error instanceof Error ? error.message : 'Conversation failed. Try again.';
    this.capture = undefined;
    this.current = undefined;
    this.state = 'idle';
    this.automatic?.report('failed', record.error);
    this.automatic = undefined;
    this.message = record.error;
    this.changed();
  }
}
