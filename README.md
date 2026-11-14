# Talk to Brim — Steps 1–2

Talk to Brim pairs a voice teammate with a deterministic, 20 Hz Bind A simulation. The main page runs one scripted attack; voice replies remain conversational. See the [simulation guide](web/src/sim/README.md) for replay, combat rules and the Step 4 interfaces, or [PLAN.md](PLAN.md) for the project plan.

## Run

Use Node **22.12+** and npm, from the repository root:

```sh
npm install
# Optional; local replies and browser speech need no paid API credentials:
cp .env.example server/.env
npm run dev
```

Open **http://127.0.0.1:5173** in Chrome (map sandbox: **/sandbox.html**, dev only). If that port is occupied, use `WEB_PORT=5174 npm run dev` and open 5174. Ctrl+C stops both servers. Express binds to loopback on 3001 by default. Vite forwards `/api` unchanged to Express, avoiding CORS configuration. Restart dev after changing environment settings so both processes read the same ports.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Both servers, with watching |
| `npm run typecheck` | Browser, server, shared contracts, configuration and tests |
| `npm run test` | Contract, API, SDK transport, recognition, controls, lifecycle, map data and test-round tests |
| `npm run build` | Typecheck, Vite frontend and compiled Node backend |
| `npm run start:server` | Run compiled backend after build |

Frontend output: `web/dist/`. Backend: `dist/server/`, importing `dist/shared/`. Production hosting must serve the frontend and forward same-origin `/api` to Node; deployment is outside this step. Chrome's Web Speech recognition generally requires network access even when no paid API key is configured. Browser synthesis voices depend on the OS/browser installation.

## Try it

1. Hold Space, or hold the talk button. Allow Chrome/system microphone permissions.
2. Say “Brim, you ready?” Interim text appears while you speak.
3. Release. Only finalized recognition text is sent. Brim's reply appears before audio begins.
4. The state progresses through Listening → Thinking → Speaking → Idle.
5. Alternatively, enter a message and click Send or press Enter.
6. Press push-to-talk during speech to interrupt immediately. Stop cancels the current request/capture/audio. New text replaces the current conversation.
7. Download trace JSON to inspect completed, failed, and interrupted turns.

Space repeats are ignored; Space inside inputs/contenteditable remains normal typing. Pointer capture covers release outside the button. Pointer cancellation, lost capture, hidden document, and lost window focus **discard** the current turn rather than submitting accidental partial speech. Empty final recognition is not replaced with interim guesses. Recognition failures return to Idle with a message and leave text input usable.

The development-only microphone permission checker from Step 0 remains available. It acquires audio permission and immediately stops all tracks. It does not record.

## Voice pipeline and ownership

```text
shared/schema.ts              unchanged six gameplay contracts; optional request context added
server/
  app.ts                      health, validated response and streaming TTS routes
  voice.ts                    OpenAI adapter, safe voice-check replies, local fallback
  config.ts / index.ts        server-only environment, ports, startup
  app.test.ts                 real HTTP, cancellation, failure and SDK transport tests
web/src/
  main.ts                     minimal UI, health check and log rendering
  voice/stt.ts                Chrome Web Speech wrapper; interim/final handling
  voice/controls.ts           Space/pointer/focus lifecycle
  voice/conversation.ts       state machine and per-turn cancellation/generation IDs
  voice/tts.ts                audio element, incremental MP3, browser speech fallback
  comms/brimClient.ts         validated API calls and source metadata
  trace/log.ts                conversation records, optional TurnLog and JSON export
  styles/theme.css            reused black theme, basic usable controls, map panel
  voice/*.test.ts             recognition, controls, speech fallback and lifecycle tests
  map/                        Step 2 Bind A map module: data, A*/LOS, renderer, effects (+ bindA.test.ts)
  ui/mapPanel.ts              Step 2 integration: map + HUD strip under the voice stage
  sim/testScene.ts            original scripted sandbox round (+ testScene.test.ts)
  sandbox/ (+ sandbox.html)   dev-only map sandbox: scrubber, designer view, coordinate tool
  plays/                      fastPlant.ts: one attack split between Short and Showers
```

Voice/brain owner A owns voice/comms/server. B owns later map/UI, C simulation/agents, D plays/evidence. Contracts are shared team ownership; see PLAN.md for smaller-team splits. The old `src/map.js` and `src/plays.js` mentioned in PLAN.md are absent here. Neither has been invented or ported.

Each conversation has a generation ID. Beginning another turn aborts the previous request and stops audio before requesting microphone access. Late results and callbacks check their generation before changing UI or starting speech. Recognition has a 30-second listening cap and a 2-second finalization timeout. Response generation has a server deadline and a separate client deadline. Playback has a finite deadline so missing media/synthesis events cannot keep the UI busy indefinitely.

Each hosted attempt owns its audio element, source buffer, reader, media URL, and listeners. The `<audio>` source feeds an `AudioContext` → `AnalyserNode` → speakers when available; that analyser now drives the Step 1b waveform. MSE appends MP3 chunks and requests play after the first append, without waiting for EOF. Stream completion finishes the media source; cancellation aborts fetch/pumping and releases resources. Unsupported MP3 MSE uses a **clearly reported buffered hosted path**. A hosted failure falls back to browser `speechSynthesis`, unless the turn was cancelled. Browser synthesis cannot feed an analyser. Audio starts are measured from media `playing` / utterance `onstart`, not an acoustic measurement of the speakers.

## API and contracts

```sh
curl http://127.0.0.1:3001/api/health
# {"status":"ok"}
curl -i -X POST http://127.0.0.1:5173/api/brim \
  -H 'Content-Type: application/json' -d '{"transcript":"Brim, you ready?"}'
# X-Brim-Source: local (or openai)
# {"reply":"Ready, rookie. Loud and clear.","actions":[],"needs":null}
curl -X POST http://127.0.0.1:5173/api/tts \
  -H 'Content-Type: application/json' -d '{"text":"Ready, rookie. Loud and clear."}' \
  --output /tmp/brim-speech.mp3
# Only produces MP3 when hosted TTS is configured. Otherwise returns JSON 503.
```

`POST /api/brim`: `{ transcript: string, gameState?: GameStateForLLM }`. Transcript is trimmed, nonempty, max 2000 characters. Existing text-only callers remain valid. Optional context uses the exact shared schema; the frontend sends none because there is no simulation. `BrimResponse` body fields are unchanged. `X-Brim-Source` distinguishes `local` from `openai` without inventing new body fields.

**Deliberately bounded conversation:** the LLM uses Responses structured output to interpret speech and select among eight concise, original voice-check replies in `server/voice.ts`. This is intentionally not unrestricted chat: an output reply must belong to that set, contain at most 12 words, and have `actions: []` and `needs: null`. This guarantees Brim cannot hallucinate performed gameplay in Step 1a, even if asked to ignore instructions. Readiness, repeat requests, thanks, and unconnected game requests are represented. The deterministic local fallback recognizes only basic greetings/readiness; everything else explicitly says actions are not connected. It is not the Step 6 keyword matcher. Expand response generation alongside actual game semantics in later steps.

The server uses the official `openai` SDK (installed 7.57.0), `responses.parse`, `zodTextFormat`, `store: false`, and no automatic retries. Refused/incomplete/schema-invalid/unsafe outputs fail; provider failures are never disguised as a successful LLM reply. Select `LLM_PROVIDER=local` for an explicit offline-development response path.

`POST /api/tts`: `{ text: string }`, 1–12 words and max 240 characters. Returns `audio/mpeg` streamed from the upstream Speech API, without whole-response buffering on the server. It returns 503 when unconfigured. Failed streams already in progress are closed; the browser detects the failure or deadline and falls back. No voice cloning or Riot recordings are used. The UI discloses that speech is AI generated.

All errors use `{ "error": { "code": "…", "message": "…" } }`. Statuses: 400 validation/malformed JSON, 413 body too large (16 KB limit), 415 unsupported content type, 404 missing route, 503 missing provider configuration, 502 provider/invalid-output failures, 504 deadline exceeded. Client disconnect aborts provider work; no stale response is spoken.

Import shared runtime schemas and types rather than duplicating them:

```ts
// server module:
import { BrimResponseSchema, type BrimResponse } from '../shared/schema.js';
// web/src/main.ts uses '../../shared/schema.js'; deeper modules add another ../.
```

`RegionId`, `Action`, `BrimResponse`, `GameStateForLLM`, `TurnLog`, and `BrimEvent` retain the exact PLAN.md fields/enums/nullability. `RegionId` is the 15 Bind A callouts drawn on the map (no `tp`; teleporters are out of scope). The map imports this type rather than redefining it, and `web/src/map/bindA.test.ts` fails if the drawn regions and the enum diverge. Additional endpoint schemas are `BrimRequestSchema`, `HealthResponseSchema`, and `TtsRequestSchema`. There is no dependency from shared into either app.

## Configuration

Only `server/.env` is loaded, optionally, and shell environment values take precedence. It is ignored by Git. Never put credentials in `web/`, browser imports, or `VITE_*` variables. Vite's environment-file loader is disabled and its file server denies `.env*` paths.

| Variable | Default / meaning |
| --- | --- |
| `PORT` | `3001`, API and matching Vite proxy target |
| `WEB_PORT` | `5173`, frontend dev port |
| `LLM_PROVIDER` | `auto`: OpenAI with a key, local without; `local` forces deterministic replies; `openai` requires a key |
| `TTS_PROVIDER` | `auto`: OpenAI with a key, browser without; `browser` forces fallback; `openai` requires a key |
| `OPENAI_API_KEY` | Server-only common key, optional |
| `LLM_API_KEY` / `TTS_API_KEY` | Optional service-specific overrides of the common key |
| `LLM_MODEL` | `gpt-4.1-mini` |
| `LLM_TIMEOUT_MS` | `2000`, range 100–30000 |
| `TTS_MODEL` | `gpt-4o-mini-tts` |
| `TTS_VOICE_ID` | `onyx`, an original built-in synthetic voice; configurable |
| `TTS_TIMEOUT_MS` | `15000`, range 100–60000 |

No paid credentials: local response generation, Chrome recognition, text input, browser synthesis, logs and trace export work (subject to browser permissions/voices/network). Credentials are required for actual OpenAI interpretation and hosted audio generation. `TTS_VOICE_ID` should be auditioned by the team on the demo machine.

Official references used: [Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [GPT-4.1 mini support](https://developers.openai.com/api/docs/models/gpt-4.1-mini), and [Speech API / streaming / voice options](https://developers.openai.com/api/docs/guides/text-to-speech). **The Speech API guide currently marks `gpt-4o-mini-tts` deprecated with shutdown January 6, 2027.** It is usable for this November hackathon; longer-lived deployment must migrate to the supported Realtime workflow or another hosted provider. That migration is deliberately outside Step 1a. Recognition finalization and streaming capability detection follow [SpeechRecognition.stop](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/stop) and [MediaSource.isTypeSupported](https://developer.mozilla.org/en-US/docs/Web/API/MediaSource/isTypeSupported_static).

## Trace timing

Export contains `{ version: 1, scope: "voice-only", records: ConversationRecord[] }`. Records hold input source, actual response source, audio mode, status, transcript, response, notices/errors, and timings using client `performance.now()`:

- `stt`: time from releasing push-to-talk until recognition finalizes; zero if finalization finished before release. **null for text input, unavailable or failed recognition.**
- `think`: client response-request duration, including transport. **null if no successful response returned.**
- `firstAudio`: release-to-first-playback event for voice; text-submit-to-first-playback event for text. **null when audio never starts.**

A completed OpenAI voice turn with every timing available includes an unchanged shared `TurnLog` with `path: 'llm'`. Local replies cannot honestly use `path: 'keyword'` or `'llm'`, and text input cannot honestly invent an STT number, so those turns use the surrounding conversation record without a `TurnLog`. Failed/interrupted attempts retain their status, available measurements, notices, response if received, and error where applicable. Missing data is never fabricated. No gameplay BrimEvents or scoring are created. Logs are memory-only; export before reloading.

## Verification and remaining manual checks

Automated tests cover shared contracts, health and request validation, safe local replies, optional game context, SDK structured-output transport with a fake key/fetch, invalid generated output, provider timeout/failure/recovery, early server audio chunks, cancellation, recognition permission/device/network errors, final-only submission, repeated push-to-talk, focus/pointer cancellation, stale results, audio fallback, and interruption. SDK transport and audio-chunk tests use controlled fixtures; they are not proof of a paid provider connection or real audio decoding.

Browser checks exercise the no-credentials text path: a readiness response reaches Speaking via browser synthesis, then Idle; Stop interrupts active speech; Space in the text field stays a space; game requests receive the honest unconnected response; completed/interrupted turns appear in the log; downloaded JSON contains real timing values, local source labels, and null STT. Real hardware sound output is not acoustically confirmed.

Executed on November 14, 2026 (Node 25.2.1, npm 11.6.2): `npm install openai` succeeded with no reported vulnerabilities; `npm run typecheck`, all **27** tests, and `npm run build` passed. Build emitted two harmless Zod comment-annotation warnings. `WEB_PORT=5174 npm run dev` launched both processes; health, schema-valid local replies, and explicit TTS 503 fallback passed directly on 3001 and via 5174. The downloaded browser trace contained three completed local/browser turns and one interrupted turn. Provider and recognition tests used controlled fixtures. Temporary development servers were stopped afterward. PLAN.md SHA-256 stayed `8f59b212a941f07f0b78101cbb6f990f13dbd7a94757561db1d3d1d6fafaa657`.

Manual demo-laptop checks still required:

- Open in Chrome on localhost/HTTPS, grant browser/system microphone permission, confirm interim/final recognition and key/pointer release behavior using a real microphone.
- Confirm actual speaker output, chosen hosted voice, five consecutive readiness exchanges, barge-in, and the ≤2.5-second LLM-path target. This target has **not** been established with live providers.
- Supply credentials and verify real Responses connectivity, account model access, hosted audio generation and incremental browser playback. Test both denied permission and disconnected-network behavior on the demo hardware.

All gameplay work remains deferred.


## Step 1b voice stage

The UI uses the existing conversation store and control bindings. `web/index.html` and `styles/theme.css` define the pure-black responsive stage, state indicator, Learn/Match selection, text fallback, collapsible history and trace export. (The near-black map placeholder was replaced by the Step 2 map panel below.) No image assets, UI frameworks or dependencies were added; the waveform and controls are code-native.

`ui/waveform.ts` draws three phased sine waves with edge taper, smoothed levels/colors, high-DPI resizing and one independently owned animation loop. Idle is almost flat gray; listening is cyan with microphone RMS; thinking is a low amber traveling shimmer; speaking glows orange with playback RMS. Reduced motion freezes phase travel and lowers redraw frequency. Hidden documents skip drawing; disposal cancels the loop and resize observer.

`voice/audioLevels.ts` requests at most one active metering stream per hold, alongside Web Speech's internally managed capture. The metering source connects only to its analyser, never speakers. Release, error, interruption and teardown stop tracks and disconnect nodes; a permission result arriving after cancellation immediately stops its tracks. Metering never delays recognition or submission. Chrome/system permissions still require manual verification. A denied metering stream displays a notice; recognition and text remain available.

`voice/tts.ts` retains its existing streaming and cancellation flow and adds visual telemetry. Hosted speech samples the existing analyser. Browser synthesis uses a deliberately simulated envelope: boundary events add decaying pulses; a time-based pulse keeps it moving when boundary events are absent. This is not measured synthesis volume. New playback still owns its media source; no duplicate MediaElementSourceNodes are added.

`ui/subtitles.ts` shows response text before playback, highlights only the active word, and fades about three seconds after speech ends. Browser word boundaries use actual character offsets. Hosted timing uses currentTime/duration when duration is finite; otherwise progression estimates 2.6 words/second. The backend supplies no timestamps, so none are claimed. Live user text is shown only during the hold and retained in history afterward. Audio failure leaves received text readable. Subtitle timers are cancelled for replacement/teardown; DOM updates happen only when content/highlight changes.

Verification: `npm run typecheck`, `npm run test` (31 tests) and `npm run build` passed, including existing Step 1a cases plus RMS/taper/smoothing, estimated/boundary word selection, fade cancellation and late microphone cleanup. Browser testing at 1280×720 and 390×844 covered idle waveform, speaking synthesis envelope, word highlight, return to idle, subtitle fade, text input, interruption, mode selection and history expand/collapse; mobile had no horizontal overflow and console had no warnings/errors. Listening and thinking visuals are implemented but were not exercised end-to-end in the browser. Real microphone-reactive movement and hosted playback-reactive movement remain manual checks; no live provider credentials or hardware test was used. The Step 1 performance target is still unverified with live providers. PLAN.md is unchanged.


## Step 2 Bind A map

PLAN.md was replaced with the newer A-site version (Vent/Back Site/Pillar/Tower callouts, no TP, Step 2 ticked), so the PLAN.md SHA recorded in the Step 1 logs above refers to the earlier plan. `web/src/map/` is the Bind A module (regions, cover, icons, effects, A*, line of sight; see its README). `ui/mapPanel.ts` mounts it under the voice stage on the near-black panel with a HUD strip (round/spike timer · Brim's smokes · spike · mode) and a control row (pause, restart, callout labels, designer view). In the original Step 2 build, `sim/testScene.ts` plays a scripted 20-second Fast-plant round on loop; the panel labels it "Scripted test round".

- **Own loop, sim time:** the panel runs its own `requestAnimationFrame` loop with a sim clock (frame delta clamped to 0.1 s), separate from the waveform loop and from conversation state. Effects receive sim time, never wall-clock. Drawing is skipped while the map is scrolled off-screen.
- **Voice hooks:** Brim's icon gets the amber speaking pulse only while his real TTS plays (`conversation.state === 'speaking'`); the scripted round has no audio of its own. In Learn mode the round runs at 0.5× while push-to-talk is held (HUD shows `Learn · 0.5×`); Match mode stays 1×. The header Learn/Match buttons are now functional.
- **Keys:** Space stays push-to-talk. P play/pause, R restart, L Learn/Match, D designer view; ignored in text fields and with modifier keys. Map controls drop focus after a mouse click so a focused button cannot swallow Space.
- **Layout:** the global `canvas` rules in `theme.css` were scoped to `#waveform` so they no longer squash the map. On screens up to 1200 px tall (wider than 600 px) the stage compacts to ~35% of the viewport, with talk button and text box on one row, and the map sizes itself to fit underneath (minimum 560 px wide). Measured in headless Chrome: stage + map fit one viewport at 1512×860, 1440×900, 1920×1080, 1920×1200 and 2560×1440 windows; a 1280×800 window scrolls 60 px. No horizontal overflow at 390 px.
- **Sandbox:** `/sandbox.html` (dev only; Vite builds only `index.html`) keeps the scrubber, designer view, nav-grid overlay and coordinate tool (click copies a point, shift+drag a rectangle for `bindA.ts`). URL params: `?t=9.5&pause=1&designer=1&labels=0&nav=1&mode=learn`.

Verification (November 14, 2026, Node 20.20): `npm run typecheck`, `npm run test` (**40** tests) and `npm run build` passed (the build emits only `index.html`; the sandbox stays dev-only). A headless-Chrome run over the DevTools protocol confirmed the round advances, P/R/L/D work and are ignored while typing, a text call still gets a spoken subtitled reply with the map running, and there are no exceptions (only the expected `/api/tts` 503 without a key and a missing favicon). Not yet checked by hand: 60 fps on the demo laptop, real-microphone Learn-mode slow-down.

## Step 3: replay a live round

Open the main page with `?seed=2026`; **R** replays that same seed. Omen's hold varies with the seed. The main page shows live allies and only the defenders Raze or Brim can currently see; **D** toggles the full scene. The 40-second scenario stops at its time limit. The spike stays with Sova or drops where he dies. The sandbox keeps the original Step 2 visual demo.
