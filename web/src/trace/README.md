# Conversation and round trace

Download trace exports version 2, with `bot` (`relai` or `plain`), conversation records plus a rounds array. The file is named `relai-trace-<bot>-seed<seed>.json`. Every live command carries its roundId, simulation time, keyword/LLM path, interpretation when available, validator result, accepted goal IDs, decision time and measured processing cost. The surrounding record contains the original transcript, actual spoken line, input and audio source, interruptions and nullable STT, think and first-audio times. A shared TurnLog is attached only when its required timings are available.

Each rounds entry includes seed, roundId, end (restart or current) and time-ordered BrimEvents. Join command goal IDs to controller events within the same round. A did event records a real simulation action. Deployment precedes smoke landing by 12 ticks. A said event links a turn ID and its line to the first observed playback-start callback. Audio failure before playback leaves the subtitle and no said event.

Simulation timestamps use round seconds. Conversation timestamps use seconds since page initialization. Durations use client performance.now() in milliseconds. Restart archives the departing round; reload clears in-memory history.

## Automatic enemy speech

An automatic conversation record has `input: "callout"` and a `callout` with `roundId` and `sightingId`. Within that round, find the matching `saw` event. Its `sighting` contains the post-combat tick, region, sorted distinct defender IDs and count. The ID is local to the round. Controller observations at the start of a tick continue to appear separately.

Follow the same `sightingId` through the events. `generated` contains the template text. `skipped` explains why a pending line was dropped. `scheduled` reserves the conversation channel. Only `started` has kind `said`, with the actual line. A scheduled line ends in `completed`, `canceled` or `failed`. A canceled line may have started before the interruption. A failure before the start callback records no `said`, and the attempted line stays in history.

Hosted audio reports the media element's first `playing` event. Browser synthesis reports the utterance's `onstart`. These callbacks indicate that the playback engine started, even on a muted device. For callouts, `latencyMs.firstAudio` measures wall time from scheduling to that callback. Queue delay can be inspected separately using the observation and scheduling events' simulation times.

## Plain bot (comparison group)

`/?bot=plain` swaps in the comparison teammate used by the transfer test. It runs the same keyword matcher and LLM fallback, but skips the validator: every parsed action is enqueued as a command goal (a goal the controller can't carry out simply fails later), and every reply is `Copy.`. Pushback the default bot would give is kept in `command.validator.reason` with `ok: false` and no goals. Each such command has `plain: true`. The HUD tag reads `Plain bot · Seed N` so screenshots label themselves.
