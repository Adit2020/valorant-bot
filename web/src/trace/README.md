# Conversation and round trace

Download trace exports version 3, with `bot` (`relai` or `plain`), conversation records plus a rounds array. The file is named `relai-trace-<bot>-seed<seed>.json`. Every live command carries its roundId, simulation time, keyword/LLM path, interpretation when available, validator result, accepted goal IDs, decision time and measured processing cost. The surrounding record contains the original transcript, actual spoken line, input and audio source, interruptions and nullable STT, think and first-audio times. A shared TurnLog is attached only when its required timings are available.

Each rounds entry includes seed, roundId, end (restart or current) and time-ordered BrimEvents. Join command goal IDs to controller events within the same round. A did event records a real simulation action. Deployment precedes smoke landing by 12 ticks. A said event links a turn ID and its line to the first observed playback-start callback. Audio failure before playback leaves the subtitle and no said event.

Simulation timestamps use round seconds. Conversation timestamps use seconds since page initialization. Durations use client performance.now() in milliseconds. Restart archives the departing round; reload clears in-memory history.

## Automatic enemy speech

An automatic conversation record has `input: "callout"` and a `callout` with `roundId` and `sightingId`. Within that round, find the matching `saw` event. Its `sighting` contains the post-combat tick, region, sorted distinct defender IDs and count. The ID is local to the round. Controller observations at the start of a tick continue to appear separately.

Follow the same `sightingId` through the events. `generated` contains the template text. `skipped` explains why a pending line was dropped. `scheduled` reserves the conversation channel. Only `started` has kind `said`, with the actual line. A scheduled line ends in `completed`, `canceled` or `failed`. A canceled line may have started before the interruption. A failure before the start callback records no `said`, and the attempted line stays in history.

Hosted audio reports the media element's first `playing` event. Browser synthesis reports the utterance's `onstart`. These callbacks indicate that the playback engine started, even on a muted device. For callouts, `latencyMs.firstAudio` measures wall time from scheduling to that callback. Queue delay can be inspected separately using the observation and scheduling events' simulation times.

## Plain bot (comparison group)

`/?bot=plain` swaps in the comparison teammate used by the transfer test. It runs the same keyword matcher and LLM fallback, but skips the validator: every parsed action is enqueued as a command goal (a goal the controller can't carry out simply fails later), and every reply is `Copy.`. Pushback the default bot would give is kept in `command.validator.reason` with `ok: false` and no goals. Each such command has `plain: true`. The HUD tag reads `Plain bot · Seed N` so screenshots label themselves.


## Communication scoring v2

Use the pure `scoreTrace({ records, rounds })` export from `web/src/trace/score.ts` for the future results card. It returns `{ scoringVersion: 2, calls, rates, warnings }`. Each rate has `passed` and `eligible`. Render a zero denominator as **N/A**. The CLI uses the same function and metric denominators. Run `npm run score -- path/to/file.json` to print per-file rates and write a separate `results/calls-v2.csv`. Paired summaries pool eligible observations within participant and phase, then give each paired participant equal weight for that metric.

Only finalized player voice/text on the live path enters the analysis. Each row keeps the record ID, round ID and submission time. A voice report's `assessedAt` uses the live push-to-talk release tick when available. Text uses submission time. Action scheduling still uses the finalized command. Transcript failures, buy chips, automatic calls and post-round chat supply no observations. Acknowledging an enemy report creates no action goal and gives no accuracy credit.

The offline recorder samples the living defenders' IDs and actual regions at live tick zero and after each combat/perception pass. It stores a complete frame only when this information or public visibility changes. `throughTick` bounds the last frame. The visibility bit comes from the same Raze-or-Brim union used on the normal map, subject to life, range, FOV, cover and landed smoke. Other allies' private views and speech playback do not establish an opportunity. Buy shows only allies in normal fog. Active-round downloads withhold privileged frames. Finish or restart the round before exporting to score it. The controller, renderer, conversation history and LLM receive no evaluation frames.

| Metric | Eligible unit | Pass |
| --- | --- | --- |
| Location | Resolved affirmative region/identity claim with evidence, excluding repeat credits | A living defender is currently visible there. A named defender must itself be visible there. Offline `factualLocation` also distinguishes a factually correct hidden guess from an empty region or wrong identity. |
| Count stated | First grounded claim per visible group | A positive count is explicitly scoped to that region. |
| Count accuracy | Grounded claim with a scoped count | Matches the number of distinct living defenders publicly observable there. `actualCount` also records total occupancy. Hidden additional defenders impose no reporting obligation. |
| Timely | First grounded claim per visible group | Within 3.00 simulation seconds inclusive of the first live tick showing that group there. Unrelated frame changes do not restart the clock. |
| Brief | Enemy-report utterance, excluding duplicate-only reports | Eight or fewer whitespace-delimited words in the original transcript. |
| Clear | Same report unit, within the supported grammar | Region and reported details resolve without clarification. Actual bot prompts, validation, interruptions and latency remain in the conversation trace. |

A group is the distinct set of public defender IDs in one region, continuously visible within a round. Loss and reacquisition or a change of members starts a new opportunity. The first grounded location claim consumes that opportunity even when its count is incorrect or missing. Further calls remain in the timeline as duplicates. Each named region gets its own result. “One Heaven and two Lamps” has two count scopes. “Two Heaven and Vent” checks both locations and flags the number's scope for clarification. Unrecognized clauses remain in `unparsed` or `unclear` for review. Negative and clearance claims have no positive sighting metric. The parser prioritizes tactical language in mixed utterances. Unclassified calls contribute no enemy metrics.

`unsupported` means coverage exists and fails to support the specified claim. `unavailable` means the truth metric cannot be judged. Missing/invalid evidence, a time outside recorded coverage, or Designer view exposure makes that round's corresponding truth measurements unavailable. Wording metrics may still be available. Rates measure the quality of offered reports. Silence has zero eligible calls. The rates do not measure the fraction of opportunities a player noticed.

The old five-check total is **legacy 0–5**. Use `legacyScore.ts` only to reproduce historical numbers. A v2 trace's Brim sightings cannot reconstruct lost contacts, Raze's view or an unobserved roster. The current CLI warns and leaves missing evidence unscorable. Historical and current rates belong in separate analyses.

Both bots use the same seeded simulation, public fog and scorer. Plain responds “Copy.” and skips command validation and delegated tactical decisions. RelAI gives specific acknowledgments, asks for clarification, validates targets and inventory, and handles delegated decisions. Both retain autonomous perception-grounded calls. Different accepted goals can change the subsequent observation opportunities. The comparison measures a coaching and validation package. The header/HUD can identify the condition, and live feedback still differs during play.

## Round results view

The map panel renders results once from `Round.result` at termination and clears them on restart. The version 3 round entry includes that terminal aggregate as `result`; active rounds omit it. The results view joins player commands to events using the round-local `goalIds`, and callout lifecycle events to sightings using `sightingId`. It calls `scoreTrace` on the current round only; zero eligible metrics display N/A. `?phase=pre` and `?phase=post` withhold participant-facing results details; the existing download remains available for experimenter analysis. `?bot=plain` uses the same scorer and labels commands as unvalidated.

## Step 9a study collection

Use [the experimenter runbook](../../../docs/STUDY.md) and `?participant=P01&group=T&phase=pre` (C for Plain practice). The six linked pages select held-out A/B evaluation and four fixed practice rounds. Optional `order=balanced` assigns odd IDs AB, even IDs BA. Tests use the same Plain mechanics/Copy acknowledgments and standard automatic perception callouts for either condition. Pre/post and control practice withhold detailed results; tests suppress HUD validation/hints and lock Match. Study Designer view, lab overrides, pause/restart and mode changes are blocked.

Trace **v3** and scorer **v2** are reused. An additive `study` object records ID/condition, human-versus-fixture, phase/scenario, seed/play/mode/actual bot, order/assignment rule, local-text and automatic-callout policies, protocol/scoring version, session UUID, start/export ISO times and completion. Round entries additionally record actual `play`, `mode`, `completion`. Existing records/events/evaluation evidence/result fields keep their semantics. The ID and assigned condition are distinct from the actual evaluation bot. Practice never uses either evaluation seed or Fast Rush.

Filenames are `P01-T-pre--<session UUID>--<download counter>.json` (or `prac1`–`prac4`, `post`). A study file contains one round, including incomplete exports, failed/pending calls and zero-score completions. Active files retain the existing prohibition on exporting privileged frames. Repeated downloads get distinct names; the audit refuses duplicate participant/phase files. Completed trace evidence is for experimenter analysis and must not be shown to participants before post-test.

`npm run study -- sessions/human` validates metadata, versions, assignments, held-out settings/starting roster, timestamps, evidence, completion, duplicate/missing phases and denominators. It reuses `scoreTrace` and the existing participant-weighted `summarize`, writes `results/study.{md,csv,json}`, and exits 1 on validation errors. Only complete six-round protocols enter aggregates. Counts of public visibility episodes are separate from eligible report denominators; no metric is invented for silence. `FIX01` + `data=fixture` is synthetic and always separated from human tables. With no human pairs the report explicitly says insufficient human data. Existing `score`/`evidence` commands remain usable; the permissive score CLI is not the study integrity audit.

Study input is explicitly **local typed communication**, using the existing keyword/validation paths and installed local browser synthesis; microphone/cloud recognition and hosted LLM/TTS are disabled on study pages. This sacrifices voice/hosted interpretation measurement to keep participant data local. Group/order URL labels and practice feedback permit condition inference. A/B difficulty and order differ; counterbalancing helps but cannot justify a causal or live-game transfer claim.
