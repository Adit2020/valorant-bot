# RelAI Step 9a: experimenter runbook

Protocol `relai-9a-v1`, trace **v3**, communication scoring **v2**. Collect real sessions now; synthetic tests are not participants. No human sessions were collected by this implementation.

## Before the first volunteer (team only)

1. From the project root run `npm run dev`. Open Chrome at **http://127.0.0.1:5184**. Dependencies already exist; no reinstall is needed.
2. Use the same computer, browser, viewport, keyboard, speaker volume and local English system voice for everyone. Confirm subtitles and map are readable together. Prefer a desktop/laptop; mobile was checked for overflow, not study usability.
3. Reserve anonymous IDs P01, P02, etc. Keep only ID, condition and order in the team’s local allocation sheet. Do not collect names, email, demographic details or account identifiers. Do not put participant files in a cloud-synced folder. Use a local folder `sessions/human`; it and `results/` are gitignored.
4. Preassign T = RelAI practice, C = Plain-bot practice. Aim for 3–5 volunteers per condition. Use a shuffled, balanced local allocation list rather than choosing a condition after seeing a pre-test score. Keep the assignment fixed for all six rounds.
5. The default protocol is **A pre / B post**. If using counterbalancing, decide before recruitment, use `order=balanced` for **everyone**, and balance odd/even participant IDs within each group: odd → AB, even → BA. Alternatively preassign `order=AB` or `order=BA`. Do not choose order after observing performance or mix order-assignment methods within a participant.

### Local data policy and input modality

**This implementation collects typed communication transfer. It does not establish spoken/voice or real-Valorant transfer.** This is an explicit local-data protocol choice: Chrome’s existing recognition may send microphone audio to a provider, and hosted LLM/TTS can send text externally. Study URLs therefore disable microphone capture, hosted interpretation and hosted synthesis. All player calls use the existing text fallback, keyword matcher, validator and scorer. Unmatched wording gets the existing local failure/clarification response (or `Copy.` for Plain); no hosted classifier is called.

Teammate speech uses an installed **local** English browser voice through the existing playback/interruption lifecycle. If no local voice is loaded, the subtitle remains available and a notice appears. Confirm local speech before recruiting; use the same subtitle/audio policy for all volunteers and record any failure in local experimenter notes. Do not change policy halfway through a participant. Ordinary non-study URLs retain existing recognition, LLM and TTS behavior. Study metadata/trace files are never uploaded. The only study API request is the local backend health check.

Learn is selected for practice rounds 1–2 and Match for rounds 3–4. Existing Learn hints apply to treatment; its PTT slowdown does not operate with typed input. Study mode buttons are locked to these presets for both groups.

## Start URLs

Treatment example:

**http://127.0.0.1:5184/?participant=P01&group=T&phase=pre**

Control example:

**http://127.0.0.1:5184/?participant=P02&group=C&phase=pre**

Optional balanced-order example (P02 starts with B):

**http://127.0.0.1:5184/?participant=P02&group=C&phase=pre&order=balanced**

Choose ID/condition in the URL before handing over the keyboard. The browser remembers each ID’s group/order locally and rejects conflicting changes. Reuse the original URL if there is a mismatch; use a new anonymous ID for a replacement volunteer. There is no cross-computer registry: the team must keep its local allocation list consistent. IDs beginning `FIX` require `data=fixture` and are reserved for testing.

Do not add `seed`, `bot` or `agentLab`: study configuration rejects these competing overrides. Bare `?phase=pre` / `?phase=post` remain useful blinded gameplay switches and now use common evaluation bot behavior, but they lack participant metadata and cannot enter the audited study comparison.

## Read this exact script to every participant

> You will watch a small team attack a game site. You can send information and commands to your teammate in the text box and press Enter or Send. Map labels show the names you can use. Report opponents you can currently see, and direct your teammate as you think appropriate. Your teammates move and fight automatically; you do not steer a character. You will complete one initial round, four practice rounds and one final round. Initial and final rounds withhold feedback. Some practice behavior differs between versions. Please use only the displayed map and controls, do not open developer tools or other game pages, and do not enter any personal information. You may stop at any time. We save anonymous local gameplay traces to compare communication before and after practice.

Give the same orientation time (up to 60 seconds) on the ready screen. Explain text entry, map labels, Start and Download only. Do not supply example enemy locations, held-out answers, preferred commands, counts or timing hints. Do not coach during either evaluation or add extra coaching to either practice condition.

## Run one participant (no participant command line needed)

1. Open their pre URL. Check ID/phase in the study panel. The simulation waits for **Start round**, so the volunteer can read instructions first. Both tests are Match with the same Plain evaluation bot.
2. Press **Start round** once. The play is selected automatically. Let the round finish: at most **40 simulation seconds**, possibly less after a team wipe. Labels, text input, Send, Stop, subtitles and conversation history remain available. Designer view, restarts, pause and mode changes are blocked in study mode, including shortcuts. Do not use another tab during a round; hidden tabs suspend the existing simulation clock.
3. Wait for the terminal results panel. It says details are withheld in pre/post and throughout control practice. Treatment practice shows the existing metrics and command timeline.
4. Click **Download trace**. The status says **Download requested**, not “file saved”: confirm the download actually finished in Chrome’s Downloads or the filesystem. If it says **INCOMPLETE**, finish the round and download again; keep the partial file outside the analysis input folder.
5. Allow **30 seconds review/rest after each practice round for either group**, without additional experimenter feedback. There are exactly four practice rounds; no extra retries on held-out tests. Click **Continue to prac1**, then prac2, prac3, prac4 and post as the links appear. They retain ID, condition and order. Each next link is withheld until a completed-round download is requested.
6. After post, confirm six final JSON files: `pre`, `prac1`, `prac2`, `prac3`, `prac4`, `post`, all with the same ID and condition. Move the completed original files into `sessions/human`. Keep only one intended final file per participant/phase in that directory. Do not rename another participant’s trace to fill a gap.
7. Run the audit below immediately. A participant is an eligible complete protocol pair only with **all six valid files**. Do not discard inconvenient zero scores. Zero eligible reports are valid sessions with N/A metrics.

A reload/close loses in-memory turns. A navigation prompt warns after Start until a final download is requested. To stop early, download the partial round before leaving, retain it in a separate local `sessions/aborted` folder, and mark the participant incomplete in local notes. Do not replay a held-out test to replace a poor result. Audit errors exclude the participant until the correct original file is supplied; if the protocol was violated, retain the record and recruit a replacement with a new ID.

## Scenarios (experimenters only; do not read the answers aloud)

| Phase | Scenario | Seed | Play | Mode | Bot for T / C |
|---|---|---|---|---|---|
| pre, default AB | A | 91001 | Fast Rush | Match | Plain / Plain |
| prac1 | practice-1 | 81001 | Fast Plant | Learn | RelAI / Plain |
| prac2 | practice-2 | 81002 | Slow Push | Learn | RelAI / Plain |
| prac3 | practice-3 | 81003 | Fast Plant | Match | RelAI / Plain |
| prac4 | practice-4 | 81004 | Slow Push | Match | RelAI / Plain |
| post, default AB | B | 91002 | Fast Rush | Match | Plain / Plain |

BA swaps only A/B’s pre/post assignment. All practice seeds, plays, modes, maximum round time, orientation and review allowances are the same between groups.

A and B use the existing standard lineup: Jett Heaven, Killjoy U-Hall, Chamber Back Site, Viper Truck. The explicit seed places Omen in Cubby for A and at the existing Triple spot for B. That Triple spot resolves to the **Default** region under the existing map geometry; this is intentional reuse, not a change to placement/scoring. The audit checks the starting ground-truth roster. Neither held-out seed nor the Fast Rush play is used in practice. No new combat, navigation, defender-placement, perception or scoring rules were added.

A silent deterministic run exposes **4 visibility episodes over 3 distinct regions**, finishing at 10.30 s. B exposes **5 episodes over 4 regions**, finishing at 11.50 s. Reacquisition counts as another episode. Opportunities come from the ordinary Raze-or-Brim public view, never Designer view or offline evidence. Actual opportunities and duration may change with player commands; the report records their counts. There is no participant need to know privileged positions.

**Difficulty and order can confound gains.** Different Omen positions, unequal opportunity counts, short combat windows, recognition/typing skill and small nonrandom samples limit interpretation. Count opportunities in these silent scenarios are principally singleton enemies, so this is a weak test of multi-enemy count skill. Nearby practice geometry can be familiar even though full evaluation seed/play combinations are held out. Balanced order helps with systematic order effects but does not make the scenarios equally difficult. Four training rounds are a small dose. Do not claim causation or generalization to live Valorant.

## Evaluation fairness and blinding

Both groups use the existing **Plain bot mechanics** in both tests: it acknowledges `Copy.`, does not coach, validate or make delegated tactical decisions, and enqueues parsed actions through the existing controller. Impossible goals may later fail. The same keyword interpretation is used for both groups; reports do not create action goals. Normal commands such as explicit smoke/move/hold remain functional. Detailed results, training hints and validator-derived HUD feedback are hidden. Match is locked, lab overrides are disabled and Designer view cannot be enabled. Control practice also hides RelAI hints, metrics and validation feedback.

Automatic teammate enemy callouts remain **enabled in all phases**, using the unchanged perception generator, per-region cooldowns, idle-channel scheduling, stale-call cancellation and interruption rules. They can tell the participant enemy information, consistently in both tests. They are not scored as player calls and do not create scoring opportunities by themselves. Offline scoring opportunities follow only public visibility.

Full participant blinding is infeasible: practice acknowledgments/hints/results differ, the URL has T/C and phase, and the app uses RelAI branding. A participant can infer the assigned version during practice. Evaluation presentation and bot rules are common; an experimenter who knows allocation is not blinded. Developer tools can circumvent client controls; this is supervised experiment operation, not tamper-proof research software. Do not let participants inspect terminal trace ground truth before their final test.

## Trace files and audit

Names are `P01-T-pre--<session UUID>--<download number>.json`, similarly `prac1`–`prac4` and `post`. UUIDs distinguish page sessions; the counter distinguishes repeated downloads. Browsers need not silently overwrite files. The legacy short filename prefix still parses. Duplicate phase files are an **error**, even if they have different UUIDs; select the original intended final download explicitly and retain other attempts outside analysis.

The existing trace v3 has a small additive `study` object: protocol/scoring version, anonymous ID, assigned condition, data kind, study phase, scenario ID, seed, selected play, mode, actual bot, scenario order and its assignment rule, automatic-callout policy, local-text policy, session UUID, ISO start/export times and completion flag. Each round also records actual play/mode/completion alongside its existing result, simulation timestamps, commands, goals, sightings and terminal evaluation frames. Pending/failed speech and calls remain in the conversation trace. Active downloads withhold privileged frames, and are incomplete; zero-score completed rounds still export.

From the root, the **experimenter** runs:

```sh
# Study headline analysis and integrity checks (all final files in one local directory):
npm run study -- sessions/human

# Choose a different output prefix:
npm run study -- sessions/human --out results/real-study

# Existing per-call scorer remains usable:
npm run score -- sessions/human/*.json

# No sessions yet: honest no-human-data report:
npm run study -- --out results/no-data
```

`study` prints Markdown and writes `results/study.md`, `results/study.csv`, `results/study.json` by default. Markdown contains participant pre/post rates with numerator/denominator and percentage, changes in percentage points, opportunity counts, unscorable evidence, group aggregates and actionable validation messages. CSV has participant/metric rows with numerators, denominators, change, opportunities, evidence and scoring version; unavailable values are `N/A`. JSON preserves structured scores/evidence and uses `null` for unavailable metrics. Keep these reports local too.

Errors produce exit status **1** and exclude the affected participant from aggregates. Warnings (such as a zero eligible denominator) remain visible and do not invent a value. Missing pre/post/practice, duplicates, IDs/filename disagreements, invalid versions/groups, group/order changes, seed overlap, wrong scenario/play/mode/bot/defenders, leaked Designer view/feedback, invalid timestamps, local-policy violations, missing evidence and incomplete rounds are actionable. A file without valid study metadata is not accepted just because its filename resembles P01.

The report calls the existing `scoreTrace()` and existing paired-summary implementation. Each participant’s rate uses their eligible claims/reports. Each group averages participant changes **equally**, only when that participant has positive pre and post denominators for that metric. This is a participant-level estimand, not an opportunity-weighted pooled percentage; differing denominators remain visible. Metric n may differ. A complete silent participant has N/A reporting metrics, not 0%. Public visibility episodes include unreported opportunities and are shown separately from score denominators. No multiple-metric composite or causal claim is generated.

Fixtures require `FIX01` etc plus `data=fixture`, should live outside `sessions/human`, and always appear in a separate synthetic section. `score` likewise separates fixture, human and unverified legacy summaries. `study` is the authoritative audit; `score` remains the permissive legacy-compatible inspection tool. Existing `npm run evidence -- [files] [--seeds N]` remains available and unchanged for supporting metrics, not the human transfer headline.

## Team action now

Check the local voice/subtitles once on the collection laptop, preassign IDs and groups (and order policy), then recruit the first real volunteer using the script above. Save six files per person and run `npm run study -- sessions/human` immediately after each session. Collect 6–10 volunteers if practical. If time or recruitment runs out, report the actual paired n and missingness; with no eligible human data, retain the explicit insufficient-data statement.

Automated browser checks use scripted text and simulated synthesis callbacks, not real microphones, hosted LLM/TTS or acoustic output. Real volunteer behavior, local voice audibility, informed participation and study conclusions must be checked/conducted by the team. Nothing in this step implements Step 7b, a presentation or Devpost material.
