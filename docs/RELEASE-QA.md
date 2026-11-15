# RelAI release readiness — November 15, 2026

## Decision

**Software/demo integration and the typed study are ready for supervised use. A voice video is conditionally ready: the developer must pass real microphone, physical sound and recording-route preflight.** There are no available human transfer results, actual-microphone latency measurements or live hosted-provider measurements. The disclosed text/subtitle demo is the fallback.

Use [DEMO.md](DEMO.md) for the operator sequence and [STUDY.md](STUDY.md) for actual participant collection. Existing gameplay, architecture, scorer and typed-study protocol were not changed during release QA. Step 7b, new scoring/features, slides and submission-material creation remain out of scope.

## Preservation and minimal changes

All existing uncommitted implementation files and primary traces were retained. No reset, clean, commit, dependency installation, gameplay balancing, voice-state-machine rewrite or study-mode change was performed. The already-running frontend/API were reused; failure tests blocked requests in their own browser instead of stopping the user's services.

Changed in this release pass:

- `.env.example`: correct `WEB_PORT=5173` to **5184**, matching Vite/default documentation.
- `CLAUDE.md`: correct startup port and stale Step 5–9a status; identify remaining real-data/hardware checks.
- `README.md`: link the final demo runbook and this QA record.
- Added `docs/DEMO.md` and this file.

Temporary scripts, browser screenshots, synthetic traces and reports are under `/private/tmp/relai-release-qa` and `/private/tmp/relai-release-study`. Running the existing score CLI regenerated its ignored derived `results/calls-v2.csv`; no participant source file was changed.

## Environment and actual checks

Node 25.2.1; project requires 22.12+. Frontend `http://127.0.0.1:5184`, API `http://127.0.0.1:3001`. Direct/proxied health returned 200. No LLM/TTS keys were configured. Current providers were auto-without-keys; hosted requests therefore returned expected 503 and the existing native synthesis fallback ran.

Browser plugin not available: used the already-installed **Python Playwright, cached Chromium, and an additional native-voice probe in installed Chrome**. No browser/dependency installation. Main demo QA: 1440×900 desktop and 390×844 mobile. Study full flows: 1440×1000 plus mobile overflow checks.

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run test` | **135 / 135 pass**, including voice finalization/cancellation, sim/results/scoring and study audit |
| `npm run build` | Pass; existing two Zod dependency PURE-comment warnings only |
| `git diff --check` | Pass |
| Page identity, meaningful content, Vite overlay | Correct URL/title, rendered map/controls, no overlay |
| Backend health | 200 direct and through Vite |
| 15-second no-choice buy → Fast Plant | Pass through visible UI; no private-clock advancement |
| Interim text vs finalized command | Interim remained non-executing; delayed final submitted once |
| Keyword interpretation → real simulation action | Pass: two actual smoke deployments and HUD charge reduction |
| Native TTS and interruption | Unmocked `speechSynthesis` start/speaking/cancel callbacks verified; pressing PTT canceled native speech before new finalization |
| Automatic callout | Normal `One Truck.` began native playback and linked to a real sighting; canceled on death. Controlled sighting fixture `One Heaven.` also began native playback and was canceled by PTT |
| Pushback / provider recovery | Vague/off-site requests queued no goals; unavailable LLM did not guess; subsequent explicit smoke command executed |
| Results / history / download | Real command→goal→deployment/cancellation timeline, planted outcome, history and downloaded trace v3 verified |
| Desktop/mobile | Results/map/controls rendered; no horizontal overflow at 390×844; mobile virtual-keyboard/hardware interaction not certified |
| Active trace privacy | No privileged evaluation frames in current active round |
| Existing score CLI implementation | Accepted current main, recovery and sighting-fixture exports; N/A report metrics retained |
| Study collection fixture audit | **12 final files → 2 synthetic protocol pairs, 0 human pairs, 0 errors**, 36 expected zero-denominator warnings |
| Study browser errors/requests | 0 page errors, 0 console warnings/errors, 0 external/participant-data API requests (health only) |

Main demo browser run had **zero JavaScript page errors**. Its console did contain expected HTTP 503 errors for unconfigured TTS/LLM, plus a deliberately aborted health request during recovery testing. These are not a clean live-provider certification. Browser synthesis recovered from the TTS responses. The separate API-down test blocks all `/api/**` requests and checks client keyword execution/native speech without stopping the actual server.

Frame observations during the scripted buy/live page sequence: 3,346 rAF intervals, median **16.7 ms**, p95 **17.4 ms**. This is a headless-browser scheduling observation, not proof of physical-display 60 fps, recorded-video smoothness or microphone latency.

## Demo outcome and reliability boundaries

The main browser script used **scripted STT and a fake media device for metering**, with real browser synthesis and normal application/simulation code. It warmed audio, restarted, waited for the actual buy timeout, pressed/released PTT, inspected real HUD/results, downloaded files and changed viewport. It did not inject goals, observations, outcomes or spoken events.

| Event | Observed simulation time / result |
|---|---|
| Smoke Heaven and Truck accepted | 1.25 s; keyword; two goals |
| Heaven / Truck deployed | 1.30 / 1.35 s |
| Go Triple accepted / movement started | 2.30 / 2.35 s |
| Enemy sighting / native callout | One Truck at 5.50 s; trace evidence supports the visible Viper |
| Movement interrupted and canceled | Paused for a perception reaction at 5.55 s; canceled when Brim died at 6.05 s |
| Round outcome | Planted win at 40.00 s; 2 attackers and 2 defenders alive; 1 smoke left |

The smoke acknowledgment was interrupted by the second PTT; the actions still executed. The movement conversation completed, but its **goal did not**. The autonomous line began speech but was interrupted by death; do not claim a full normal-round sentence was audibly completed. The existing dev sighting fixture gives an eight-second first-shot window for a separate labeled speech/interruption clip. A full main-round movement arrival and fully spoken normal-round callout are not reliable promises.

A separate deterministic Node comparison ran the unchanged seed-2026 Fast Plant in Match: silence lost by attacker wipe at 12.10 s, with spike dropped and 3 smokes left; a keyword smoke call at 1.00 s planted/won at 40.00 s with 1 smoke left. These are controlled simulation outcomes, not people, training effects or real-world performance.

The main results correctly show **N/A** enemy-report metrics: the player supplied tactical orders, not eligible enemy-information reports. Brim's own speech does not count as participant reporting. Do not add a fabricated good report to make the results look better.

## Evidence integrity for submission

| Evidence class | Available / supported | Not established |
|---|---|---|
| Real participants | No `sessions` directory or real participant files found; audited report says insufficient human data | Any human pre/post gain, group effect or causal transfer |
| Synthetic study fixtures | Fresh FIX01/T and FIX02/C completed all six UI pages, with twelve explicit `data=fixture` exports | Human completion, skill or spoken transfer |
| Deterministic simulation | Seed/play/timing-controlled silence vs smoke outcomes; actual goal events/results | PvP win rates, user improvement or Step 7b adaptation |
| Keyword/parser checks | Existing `results/evidence.md`: keyword matcher 23/30 on the authored fixed phrasings; 0/15 trick inputs queued invalid goals for the tested fake-model harness | Live hosted-LLM comparison, unconstrained language accuracy or universal adversarial safety |
| Grounding | Existing offline evidence: 6/6 sightings and 6/6 scripted speech joins across one seed × three plays. Current completed main trace also supports its single Truck sighting against public evaluation evidence | Statistical guarantees across unseen situations, accuracy based merely on a Speaking label, or human report accuracy |
| Native speech integration | Browser/system voices enumerated in Chromium and Chrome; native playback/cancel callbacks, subtitle/history integration and barge-in state verified | Audibility, microphone quality, acoustic interruption delay, chosen hosted voice or recorder routing |
| Latency | Trace fields and pure-code/browser-event timings exist. Current STT was deliberately delayed by a script | Actual microphone-to-response latency or the project's live-provider latency targets |

The existing evidence artifact's LLM column explicitly says **not measured**. Its code-only keyword timing excludes STT/TTS. Scripted release-to-playback values include an intentionally fabricated recognition delay; they must not be placed in an actual-microphone headline. The UI discloses AI-generated speech. No fabricated participants, responses represented as humans, or completion times were added.

## Study readiness

The original `relai-9a-v1` workflow remains **typed/local**. Treatment practice uses RelAI validation/clarification/results; control practice uses Plain acknowledgments with hints/metrics withheld. Both tests use the same Plain behavior, locked Match, neutral statuses, hidden details, disabled Designer/labs/restart/pause. Assignment/order survive phase links. Both groups get the same four practice scenarios and time/instruction protocol. Default order A pre/B post and optional deterministic balancing remain explicit.

Fresh fixture metadata, anonymous/FIX IDs, actual vs assigned bot, scenario/seed/play/mode, completion, unique filenames and all six exports were checked. Score/audit commands reused the existing engines and retained N/A for zero eligibility. No fixture appeared in the human headline; the fresh report had **0 human pairs**.

Collection is ready once the team checks the local laptop's voice/subtitle policy, recruits volunteers, obtains agreement, preassigns groups/order, follows the script and confirms six downloaded final files per ID. Small samples, unequal A/B opportunity/difficulty, order, short practice, typing familiarity and imperfect blinding limit claims. No audited spoken-study switch exists: ordinary voice pages lack required study metadata, and the study audit rejects a voice/local-policy mismatch. Do not silently substitute voice sessions or label typed results as spoken improvement.

## Reproduce / inspect artifacts

- Full study: `/private/tmp/relai-release-study.py` (scripted text + synthesis callbacks); completed inputs `/private/tmp/relai-release-study/fixtures`.
- Main/native demo: `/private/tmp/relai-release-browser.py`; voice enumeration probe `/private/tmp/relai-voice-probe.py`; all-API-down probe `/private/tmp/relai-backend-down.py`.
- Main exports/screenshots/summary: `/private/tmp/relai-release-qa/`, including `main-completed-scripted-stt-native-tts.json`, `summary.json`, `backend-down.json`, `simulation-comparison.json`, `trace-grounding-check.json`, `desktop-results.png`, `mobile-results.png`, `native-callout-fixture.png`.
- Study report `/private/tmp/relai-release-study/comparison.{md,csv,json}`; explicit insufficient-human-data statement, two fixture pairs, no errors.

Commands actually used include `npm run typecheck`, `npm run test`, `npm run build`, Python Playwright scripts, `node --import tsx tools/score.ts <files>`, and `node --import tsx tools/study.ts /private/tmp/relai-release-study/fixtures --out /private/tmp/relai-release-study/comparison`. The latter two execute the same implementations as the documented npm aliases. All files are local; do not put demo artifacts into `sessions/human`.

## Remaining release gates

1. Developer verifies actual Chrome recognition, microphone permissions/device, audible native/hosted output as selected, and the final video recorder route. No agent claim substitutes for hearing/measuring hardware.
2. Complete a real-voice timed rehearsal. Use the text fallback and disclose it if recognition cannot meet the early-smoke deadline.
3. If advertising hosted LLM/TTS, supply credentials and verify actual services/account access/fallback before recording. These are optional for the keyword/browser demo and unavailable in this QA environment.
4. Recruit and conduct real typed sessions before making any human evidence claim; otherwise retain “insufficient human data.”

No serious application defect requiring a runtime change was found. The startup-port mismatch and stale operator status were corrected. For future in-app browser QA, the Browser plugin can be installed; this release used the existing Playwright fallback successfully.

## Detailed manual microphone/audio checklist

Automation used scripted recognition and a fake metering device. Native browser speech-start/end/cancel callbacks were exercised, but **physical microphone recognition and audible speaker/recording output have not been verified**. The developer must perform this check on the recording laptop:

1. Select the intended input/output devices in the OS sound settings. Enable Chrome's OS microphone permission. Open the localhost URL in Chrome, allow the site's Microphone permission, and check the correct microphone is selected. Use headphones if speaker feedback is a problem; check that the recorder captures the intended output route.
2. Expand **Development tools → Test microphone permission**. A success only means capture permission was granted and its tracks stopped; it does not prove recognition or sound quality.
3. Click **Pause**, then **Fast Plant** to start a paused live round and unlock audio. The paused round is for preflight only. Click and hold the microphone button, say **“Smoke over there”**, then release. Confirm interim words while holding, a finalized transcript after release, the subtitle **“Smoke where?”**, and that you actually hear that line. No utility should be spent. Do not confuse this with a successful complete action.
4. Repeat with **“Smoke B long”**: hear **“That's B. We're on A.”** Then say **“Smoke Heaven and Truck”**: confirm both targets appear in the finalized transcript and the reply acknowledges the command. Resume: the HUD must fall from three smokes to one, with both actual deployments. Keyword interpretation does not need an LLM key.
5. While a reply is audible, press/hold the mic again. The old audio must stop immediately, the interface must show Listening, and releasing must send only the new finalized utterance. Repeat several times. Check no delayed old reply resumes. Try the mouse hold control as well as Space.
6. Type a call and send it. A Space typed inside the text box must stay a space. **Space does not activate PTT while typing**: click/hold the microphone button, or move focus out of the text box first. P/R/L/D are similarly ignored in text fields.
7. Record a 10-second sample and play it back yourself: confirm microphone, teammate audio and readable subtitles are all captured. Do not infer audibility from the waveform or a Speaking label. Browser-synthesis waveform amplitude is simulated, not acoustic measurement.
8. Run the main sequence once with your actual voice. Confirm the smoke command's trace time is at or before **5.45 simulation seconds**. Export the preflight trace and inspect nullable timings. Real microphone-to-response latency remains unmeasured until this real test is conducted. Browser firstAudio measures a playback-start event, not sound reaching the listener.

If any recognition or output check fails, use the text/subtitle fallback and say so in the recording. Do not label a text or scripted-input take as a verified voice demonstration. Keep preflight/demo files separate from participant data.
