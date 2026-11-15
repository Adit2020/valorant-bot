# RelAI: final demo runbook

**Software and typed-study checks pass. A voice recording still requires the real mic/speaker preflight below.** No human transfer or real-microphone latency results are available.

## Start

From the repository root (Node 22.12+, existing dependencies):

```sh
LLM_PROVIDER=local TTS_PROVIDER=browser WEB_PORT=5184 npm run dev
```

Open **http://127.0.0.1:5184/?seed=2026** in desktop Chrome. API: 3001. Reuse the servers if already running; keep their terminal open. This no-paid-API profile handles the demonstrated keyword commands and native browser speech. Chrome recognition can require internet; use text if offline.

For optional hosted LLM/TTS, put credentials only in gitignored `server/.env`, remove the local/browser shell overrides, and restart. Existing project options:

```dotenv
PORT=3001
WEB_PORT=5184
LLM_PROVIDER=openai
TTS_PROVIDER=openai
OPENAI_API_KEY=<server-only key>
LLM_MODEL=gpt-4.1-mini
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE_ID=onyx
```

These are project defaults; live provider access/performance was not verified because no keys were available. Audition hosted mode before recording or keep the tested browser profile. Never expose keys in a URL, browser code, `VITE_*`, trace or recording. `.env.example` now has the correct port, 5184.

## Real hardware preflight — developer must perform

1. In Chrome on localhost, allow the site's microphone permission and Chrome's OS microphone permission. Select the correct input/output devices and volume. **Development tools → Test microphone permission** checks permission only; it does not prove recognition or audibility.
2. Click **Pause**, then **Fast Plant** for a paused preflight round. Hold the microphone button, say **“Smoke over there”**, release. Verify interim words, finalized transcript, **“Smoke where?”**, and actual audible speech. Repeat with **“Smoke B long”** → **“That's B. We're on A.”**
3. Say **“Smoke Heaven and Truck”**, release, then resume: three smoke charges must become one with two deployments. Press/hold PTT while a reply is audible: old speech must stop, Listening must appear, and release must send only the new final transcript. Repeat several times.
4. Test text fallback. Space inside the input is normal typing; use the microphone hold button or move focus outside the input before using Space. P/R/L/D also ignore text fields.
5. Record and listen to a short sample: confirm your voice, teammate audio and readable subtitles. Native playback callbacks and the simulated browser-synthesis waveform do **not** verify physical output. Do one complete real-voice rehearsal, inspect the trace, and keep it out of participant evidence.

A longer checklist is in [RELEASE-QA.md](RELEASE-QA.md). Automation used scripted recognition/fake mic metering, with **unmocked native browser synthesis** for demo QA. It did not verify real spoken input or hear speakers.

## Main take

Use the seed-2026 URL above, with no study/plain/lab flags. Choose **Match**, leave Designer **off**. After preflight has unlocked audio, click **Restart**.

| Beat | Action | Expected result |
|---|---|---|
| A | Leave the 15-second buy timer unanswered. | RelAI chooses Fast Plant by its existing deterministic timeout policy. Clicking Fast Plant is the faster explicit-selection fallback. |
| B | Immediately after Live starts, hold PTT, say **“Smoke Heaven and Truck”**, release promptly. | Final transcript → keyword acknowledgment. Aim for submission in the first 2–3 seconds; Match acceptance must be **≤5.45 simulation seconds** on this seed/play. Interim text does not execute. |
| C | Watch utility and HUD. | Three smokes become one; two deployments occur. Clouds land after 12 ticks / 0.60 s and block sight. |
| D | After deployment, interrupt the acknowledgment with PTT and say **“Go Triple.”** Submit early, preferably before 4 s. | Native speech cancels; **“Moving to Triple.”** The move starts, but combat can interrupt it and Brim may die before arrival. Show the actual status. |
| E | Leave the channel free. | **“One Truck.”** can start around 5.50 s, but may be cut off by Brim's death. Use the reliable labeled sighting clip below for a complete audible sentence. |
| G | Let the round end. | A timely smoke call plants and wins at **40.00 simulation seconds**. Silence loses around **12.10 s**. This is deterministic simulation evidence, not human training evidence. |
| H | Open results and the trace, then **Download trace**. | Show real smoke deployments and any canceled movement. Tactical smoke/move orders yield **N/A** enemy-report metrics when no eligible enemy reports were offered. Confirm the JSON actually saved. |

QA's scripted submissions were 1.25 s (smokes) and 2.30 s (movement); both deployments and the planted win were verified. These are not human STT/latency measurements. Different timing/commands/modes can change the outcome. If using Learn to gain PTT slowdown, disclose and rehearse that mode.

## F: reliable pushback clip

Fresh seed-2026 page → **Pause → Fast Plant**. Say **“Smoke over there”** and **“Smoke B long”**; show the clarifying/correcting replies and no queued goals. Give a clear keyword call and resume to show recovery. Pausing is a demo aid, never part of the study. Without a hosted LLM, unmatched wording returns **“Didn't catch that.”** rather than a guessed action.

## Reliable autonomous speech / interruption clip

Open **http://127.0.0.1:5184/?agentLab=sighting&seed=2026** under `npm run dev`. Label it a **controlled development sighting fixture**, separate from the scored round/human evidence. The URL is enabled only in development.

After audio is unlocked, click Restart. Brim genuinely sees Jett in Heaven; let **“One Heaven.”** finish. Restart again, press PTT during that line, say **“Smoke Heaven”**, release, and show the deployment. Existing normal perception/combat run with the fixture's eight-second first-shot delay; no fake sightings or speech events are injected. The trace links observation, speech start and cancellation. Keep Designer off.

## Recovery card

| Failure | Recovery |
|---|---|
| STT wrong/no final, mic denied, or noisy room | Stop; type **Smoke Heaven and Truck** and Send. Restart if the Match deadline passed. Check Chrome/OS permission and device before the next voice take. |
| Space types a space | Focus is in the input. Use the microphone hold button or click outside the input. |
| TTS silent/blocked | Use a chip/PTT/Send gesture to unlock audio; check mute, output device, installed voices and recording route. Stop a stuck turn. Subtitles remain usable. |
| Hosted TTS fails | Existing browser fallback runs before any hosted playback starts; partly spoken failures are not replayed. Use the local/browser profile for a fresh take. |
| LLM fails/is slow | Use exact keyword calls. Unresolved interpretation times out without guessing; later valid keyword calls still work. |
| Backend unavailable | Check the dev terminal, API 3001, frontend 5184 and proxy. Restart your dev processes. Client keyword gameplay can still work; restore health before claiming hosted functionality. |
| Loss/canceled goal | Inspect the real trace, restart and submit earlier. Do not edit outcomes or claim arrival. |
| Download missing | Download again and confirm Chrome Downloads. Export before reload; ordinary history is memory-only. Give separate takes distinct filenames. |

Ordinary exports are `relai-trace-relai-seed2026.json` and may include archived warm-up rounds. Save them in a local **demo/synthetic** folder, never `sessions/human`.

## Study and recording decision

Keep the validated **typed-only** [study protocol](STUDY.md). It requires six final exports per anonymous ID, fixed T/C assignment and audited analysis:

```sh
npm run study -- sessions/human
npm run score -- sessions/human/*.json
```

There is no audited voice-study switch: study metadata requires local text and PTT/hosted services are disabled. Ordinary `?phase=pre`/`post` permits voice/blinded gameplay but lacks study metadata and cannot substitute for the audited protocol. A spoken-study/privacy change needs explicit approval and validation; this workflow has not been replaced.

**Record the voice take after hardware preflight passes.** A disclosed text/subtitle take is available otherwise. No human transfer, actual microphone-to-response latency, or live hosted-LLM improvement is established.
