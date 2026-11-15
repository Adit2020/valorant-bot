# Step 9a implementation and verification

Infrastructure is ready for supervised collection. **No real participant sessions have been collected by the agent.** The local experiment report correctly states insufficient human data. Scope stops at Step 9a; no Step 7b, slides or Devpost implementation was added.

Read [STUDY.md](STUDY.md) for the exact URLs, standardized instruction script, six-round workflow, allocation, scenarios, local-data policy, analysis commands and limitations.

## Files in this change

Added:

- `web/src/trace/study.ts`: shared protocol, anonymous configuration validation, scenario/order assignment, phase links and neutral participant status text.
- `web/src/trace/studyAnalysis.ts`: strict experiment audit and paired comparison, reusing `scoreTrace()` v2 and the existing participant-summary function.
- `web/src/trace/study.test.ts`: 15 focused study regression tests.
- `tools/study.ts`: local Markdown/CSV/JSON report CLI (`npm run study`).
- `docs/STUDY.md` and this verification note.

Modified:

- `package.json`: study command; no dependency additions.
- `web/src/main.ts`: URL-driven Start → export → next workflow, browser-local assignment lock, common evaluation behavior, neutral status feedback and local-only study input routing.
- `web/src/ui/mapPanel.ts`: fixed study seed/play/mode, blocked Designer/lab/restart/pause, common evaluation HUD policy and control-practice feedback withholding; existing results renderer reused.
- `web/src/trace/log.ts`: additive study metadata and per-round play/mode/completion, unique session/export names, one-round study exports.
- `web/src/trace/session.ts`: parse the legacy filename prefix plus unique suffixes and FIX test IDs.
- `web/src/comms/liveCall.ts`: evaluation option selects identical existing Plain mechanics/acknowledgments.
- `web/src/voice/tts.ts`: opt-in local-only study synthesis; existing default playback/interruption and hosted fallback paths remain.
- `web/src/styles/theme.css`: scoped compact study layout so typed input and the map fit on a collection laptop.
- `tools/score.ts`: use embedded study identity and keep fixture/human/unverified summaries separate; scorer unchanged.
- `README.md`, `web/src/trace/README.md`: entry points, compatibility and metadata documentation.

The workspace already contained uncommitted Step 8/scorer changes when work began. They were preserved. Simulation/combat, smoke timing, defender placement, RelAI perception/validation, `scoreTrace`'s corrected algorithm, the existing results renderer and the conversation state machine were not edited by this step.

## Automated checks

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run test` | **135/135 pass**: original 120 plus 15 study tests |
| `npm run build` | Pass; two existing Zod PURE-comment annotation warnings from dependency files |
| `git diff --check` | Pass |
| `npm run score -- /private/tmp/relai-9a-browser/fixtures/*.json` | All 12 synthetic browser exports accepted by existing scorer CLI |
| `npm run study -- /private/tmp/relai-9a-browser-final/fixtures --out /private/tmp/relai-9a-browser-final/comparison-cli` | Exit 0; 2 complete **fixture** pairs; 0 human pairs; honest insufficient-human-data report |
| Existing evidence tool, offline probe, `--seeds 1` | Exit 0; existing parser/validator/grounding code runs; hosted LLM deliberately not measured |

Test coverage includes configuration/default and balanced order, ID/group validation, evaluation response and status suppression, practice condition differences, identical evaluation behavior, held-out seed/play isolation and deterministic public opportunities, metadata/naming, active truth withholding, zero-score/silent completion, participant-weighted paired changes with unequal denominators, missing/duplicate files, malformed versions/groups/evidence/defenders/timestamps, assignment drift, privacy violations, no-data reporting and synthetic separation. Existing results/simulation/voice tests remain passing.

## Browser acceptance

Browser plugin not available. Used the already-installed **Python Playwright and cached Chromium** against `http://127.0.0.1:5184/`; no dependencies or browsers installed.

Two explicit synthetic IDs (`FIX01`, T; `FIX02`, C, both `data=fixture`) completed the visible pre → prac1 → prac2 → prac3 → prac4 → post links. The test clicked actual Start, text form, Download and Continue controls and saved browser downloads. It did not advance a private simulation clock or supply privileged data to the participant interface. Scripted reports included a deliberately unsupported report to check zero scores and N/A denominators. Speech synthesis callbacks were simulated; no real human performance/audio is represented.

| Browser check | Result |
|---|---|
| Correct URL/title, meaningful rendered app, no Vite overlay | Pass |
| Pre/post start and complete-round exports | Pass |
| Treatment clarification/metrics, control Copy/withheld metrics | Pass |
| Same pre/post Copy responses for both groups | Pass |
| Match locked; hints hidden during evaluation | Pass |
| Designer, lab controls, restart/pause and mode shortcuts blocked | Pass |
| Control/evaluation command HUD and voice-status validation text suppressed | Pass |
| Active trace incomplete and contains no privileged evaluation frames | Pass |
| Unique names, assigned condition vs actual bot, phase/scenario/play/seed/mode/completion metadata | Pass |
| Synthetic pairs recognized by study CLI, kept outside human headline | Pass |
| Page errors / console warnings-errors | **0 / 0** in both full-session runs |
| External requests / participant-data API requests | **0 / 0**; local health checks only |
| Desktop map and input visible together at 1440×900 | Pass, including treatment opening hint |
| Mobile 390×844 horizontal overflow | None; not a mobile study-usability certification |

Full session acceptance ran at 1440×1000 and mobile; the final compact layout/status checks ran at 1440×900 and 390×844. The latter rechecked pre, post, T practice and C practice. Temporary scripts: `/private/tmp/relai-9a-acceptance.py`, `/private/tmp/relai-9a-layout.py`. Final completed fixtures and reports: `/private/tmp/relai-9a-browser-final/fixtures`, `/private/tmp/relai-9a-browser-final/comparison-cli.{md,csv,json}`. Early/aborted test downloads remain outside the fixture analysis directory.

Screenshot evidence: `/private/tmp/relai-9a-browser-final/layout-T-prac1.png`, `layout-C-post.png`, `layout-mobile.png`; full-session terminal screenshots also reside there. Temporary fixtures/screenshots are not participant data and are not committed.

## Remaining manual checks and limits

- Team must recruit real volunteers, obtain their agreement, preassign condition/order, follow the script, confirm six final downloads per ID and audit immediately.
- Confirm an installed local English voice is audible on the actual study laptop; visual callbacks do not verify speakers, microphone quality or human comprehension. Microphone capture, hosted LLM and hosted TTS were not tested against real services and are disabled in study mode. Ordinary gameplay still has those paths and its existing automated coverage.
- This explicitly measures **typed, keyword/local communication transfer**, not full hosted RelAI interpretation, spoken skill or live Valorant transfer. All volunteers must use the same modality/audio policy.
- A/B differ in Omen placement, public episodes (silent A=4, B=5), and duration (10.30/11.50 s). Four short training rounds, singleton count opportunities, scenario order/difficulty, typing familiarity, command-driven observations, imperfect participant/experimenter blinding and small samples confound interpretation. Optional deterministic counterbalancing is recorded, not silently applied.
- Automatic teammate callouts remain enabled using the same public-perception/cooldown/interruption policy across evaluations. They can supply enemy information; offered-report quality is not opportunity detection/recall.
- Browser-local assignment storage is not a cross-device registry or tamper-proof enrollment service. Session history is in memory until downloaded; the browser status confirms only a request. The experimenter must verify actual saved files and keep them off external/cloud services.
- No score improvement alone demonstrates causation. No eligible human data means no human transfer conclusion.
